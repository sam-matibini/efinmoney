import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidBalanceFields } from "../_shared/plaidBalances.ts";
import { plaidConfigured, plaidCredentials, plaidErrorMessage, plaidFetch } from "../_shared/plaid.ts";

async function plaid(path: string, body: Record<string, unknown>) {
  const res = await plaidFetch(path, body);
  if (!res.ok) throw new Error(plaidErrorMessage(res.json, `Plaid ${path} failed`));
  return res.json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { clientId, secret } = plaidCredentials();
    if (!clientId || !secret || !plaidConfigured()) {
      return jsonResponse({
        error: "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET on the edge function.",
      }, 500);
    }

    const { public_token, institution } = await req.json();
    if (!public_token) return jsonResponse({ error: "public_token required" }, 400);

    const exch = await plaid("/item/public_token/exchange", { public_token });
    const accountsRes = await plaid("/accounts/get", { access_token: exch.access_token });
    let liveAccounts = accountsRes.accounts || [];
    try {
      const live = await plaid("/accounts/balance/get", { access_token: exch.access_token });
      if (Array.isArray(live.accounts) && live.accounts.length) liveAccounts = live.accounts;
    } catch (e) {
      console.warn("balance/get at link time failed; using accounts/get balances:", e);
    }
    let auth_numbers: { eft?: unknown[]; ach?: unknown[] } = { eft: [], ach: [] };
    try {
      const a = await plaid("/auth/get", { access_token: exch.access_token });
      auth_numbers = a.numbers || { eft: [], ach: [] };
    } catch (e) {
      console.warn("auth/get failed (some sandbox institutions don't support auth):", e);
    }

    const { data: itemRow, error: itemErr } = await supabase.from("plaid_items").insert({
      user_id: user.id,
      item_id: exch.item_id,
      access_token: exch.access_token,
      institution_id: institution?.institution_id ?? null,
      institution_name: institution?.name ?? null,
    }).select().single();
    if (itemErr) throw itemErr;

    const accountsToInsert = (liveAccounts || []).map((acc: Record<string, unknown>) => {
      const eft = ((auth_numbers.eft || []) as Array<Record<string, unknown>>)
        .find((e) => e.account_id === acc.account_id);
      const ach = ((auth_numbers.ach || []) as Array<Record<string, unknown>>)
        .find((e) => e.account_id === acc.account_id);
      const balances = acc.balances as Record<string, unknown> | undefined;
      const live = plaidBalanceFields(balances, String(balances?.iso_currency_code || "CAD"));
      return {
        user_id: user.id,
        item_id: itemRow.id,
        plaid_account_id: acc.account_id,
        name: acc.name,
        official_name: acc.official_name,
        mask: acc.mask,
        subtype: acc.subtype,
        type: acc.type,
        institution_number: eft?.institution ?? ach?.routing ?? null,
        branch_number: eft?.branch ?? null,
        account_number: eft?.account ?? ach?.account ?? null,
        currency_code: live.currency_code,
        available_balance: live.available_balance,
        current_balance: live.current_balance,
        balances_iso_currency: live.balances_iso_currency,
        balances_updated_at: live.balances_updated_at,
      };
    });
    let insertedIds: string[] = [];
    let insertedAccounts: Array<{ id: string; plaid_account_id: string }> = [];
    if (accountsToInsert.length) {
      const { data: inserted, error: aErr } = await supabase
        .from("plaid_accounts")
        .insert(accountsToInsert)
        .select("id, plaid_account_id");
      if (aErr) throw aErr;
      insertedAccounts = (inserted || []) as Array<{ id: string; plaid_account_id: string }>;
      insertedIds = insertedAccounts.map((r) => r.id);
    }

    // Ownership check via Identity product (best-effort — do not fail the link).
    let identityMatch: string | null = null;
    try {
      const ident = await plaid("/identity/get", { access_token: exch.access_token });
      const accounts = (ident.accounts || []) as Array<Record<string, unknown>>;
      const owners = accounts.flatMap((a) => (a.owners as Array<Record<string, unknown>>) || []);
      const names = owners.flatMap((o) => (o.names as string[]) || []);
      const emails = owners.flatMap((o) =>
        ((o.emails as Array<Record<string, unknown>>) || []).map((e) => e.data),
      );
      const phones = owners.flatMap((o) =>
        ((o.phone_numbers as Array<Record<string, unknown>>) || []).map((p) => p.data),
      );
      const addresses = owners.flatMap((o) => (o.addresses as unknown[]) || []);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileName = String(profile?.full_name || "").trim().toLowerCase();
      const nameHit = profileName
        ? names.some((n) => String(n).toLowerCase().includes(profileName.split(/\s+/)[0] || "") ||
          profileName.includes(String(n).toLowerCase().split(/\s+/)[0] || ""))
        : false;
      const emailHit = user.email
        ? emails.some((e) => String(e).toLowerCase() === user.email!.toLowerCase())
        : false;
      identityMatch = nameHit || emailHit ? "matched" : names.length ? "mismatch" : "unknown";

      const firstAccountId = insertedAccounts[0]?.id ?? null;
      await supabase.from("plaid_identity_checks").upsert(
        {
          user_id: user.id,
          plaid_item_id: itemRow.id,
          plaid_account_id: firstAccountId,
          names,
          emails,
          phone_numbers: phones,
          addresses,
          match_status: identityMatch,
          raw_payload: ident,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "plaid_item_id", ignoreDuplicates: false },
      );
    } catch (e) {
      console.warn("identity/get at link time failed:", e);
    }

    return jsonResponse({
      success: true,
      item_id: itemRow.id,
      accounts: accountsToInsert.length,
      account_ids: insertedIds,
      account_id: insertedIds[0] ?? null,
      identity_match: identityMatch,
    });
  } catch (e) {
    console.error("plaid-exchange-token error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
