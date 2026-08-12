import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);
const RAW_ENV = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
const PLAID_ENV = ALLOWED_ENVS.has(RAW_ENV) ? RAW_ENV : "production";
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;

function plaidCredentials() {
  const clientId = (Deno.env.get("PLAID_CLIENT_ID") || "").trim();
  const secret = (Deno.env.get("PLAID_SECRET") || "").trim();
  return { clientId, secret };
}

async function plaid(path: string, body: Record<string, unknown>) {
  const { clientId, secret } = plaidCredentials();
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || data.display_message || `Plaid ${path} failed`);
  return data;
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
    if (!clientId || !secret) {
      return jsonResponse({
        error: "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET on the edge function.",
      }, 500);
    }

    const { public_token, institution } = await req.json();
    if (!public_token) return jsonResponse({ error: "public_token required" }, 400);

    const exch = await plaid("/item/public_token/exchange", { public_token });
    const accountsRes = await plaid("/accounts/get", { access_token: exch.access_token });
    let auth_numbers: { eft?: unknown[] } = { eft: [] };
    try {
      const a = await plaid("/auth/get", { access_token: exch.access_token });
      auth_numbers = a.numbers || { eft: [] };
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

    const accountsToInsert = (accountsRes.accounts || []).map((acc: Record<string, unknown>) => {
      const eft = ((auth_numbers.eft || []) as Array<Record<string, unknown>>)
        .find((e) => e.account_id === acc.account_id);
      const balances = acc.balances as Record<string, unknown> | undefined;
      return {
        user_id: user.id,
        item_id: itemRow.id,
        plaid_account_id: acc.account_id,
        name: acc.name,
        official_name: acc.official_name,
        mask: acc.mask,
        subtype: acc.subtype,
        type: acc.type,
        institution_number: eft?.institution ?? null,
        branch_number: eft?.branch ?? null,
        account_number: eft?.account ?? null,
        currency_code: balances?.iso_currency_code || "CAD",
      };
    });
    let insertedIds: string[] = [];
    if (accountsToInsert.length) {
      const { data: inserted, error: aErr } = await supabase
        .from("plaid_accounts")
        .insert(accountsToInsert)
        .select("id");
      if (aErr) throw aErr;
      insertedIds = (inserted || []).map((r: { id: string }) => r.id);
    }

    return jsonResponse({
      success: true,
      item_id: itemRow.id,
      accounts: accountsToInsert.length,
      account_ids: insertedIds,
      account_id: insertedIds[0] ?? null,
    });
  } catch (e) {
    console.error("plaid-exchange-token error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
