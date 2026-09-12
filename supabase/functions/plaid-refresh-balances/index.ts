import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidBalanceFields } from "../_shared/plaidBalances.ts";

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);
const RAW_ENV = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
const PLAID_ENV = ALLOWED_ENVS.has(RAW_ENV) ? RAW_ENV : "production";
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;
const MIN_REFRESH_MS = 60_000;

function plaidCredentials() {
  const clientId = (Deno.env.get("PLAID_CLIENT_ID") || "").trim();
  const secret = (Deno.env.get("PLAID_SECRET") || "").trim();
  return { clientId, secret };
}

type PlaidError = Error & { code?: string };

async function plaid(path: string, body: Record<string, unknown>) {
  const { clientId, secret } = plaidCredentials();
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_message || data.display_message || `Plaid ${path} failed`) as PlaidError;
    err.code = data.error_code;
    throw err;
  }
  return data;
}

function needsReconnect(code: string | undefined, message: string): boolean {
  const c = (code || "").toUpperCase();
  if (c === "ITEM_LOGIN_REQUIRED" || c === "PENDING_EXPIRATION") return true;
  return /ITEM_LOGIN_REQUIRED|login required|reconnect/i.test(message);
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
      });
    }

    const body = await req.json().catch(() => ({})) as { force?: boolean };
    const force = body.force === true;

    const { data: items, error: itemErr } = await supabase
      .from("plaid_items")
      .select("id, access_token, institution_name, status")
      .eq("user_id", user.id);
    if (itemErr) throw itemErr;

    if (!items?.length) {
      return jsonResponse({ accounts: [], items: [], refreshed: 0, cached: true });
    }

    const { data: accounts, error: accErr } = await supabase
      .from("plaid_accounts")
      .select(
        "id, item_id, plaid_account_id, name, mask, currency_code, available_balance, current_balance, balances_iso_currency, balances_updated_at",
      )
      .eq("user_id", user.id);
    if (accErr) throw accErr;

    type AccountRow = NonNullable<typeof accounts>[number];
    const byItem = new Map<string, AccountRow[]>();
    for (const row of accounts || []) {
      const list = byItem.get(row.item_id) || [];
      list.push(row);
      byItem.set(row.item_id, list);
    }

    const errors: Array<{
      item_id: string;
      institution: string | null;
      error: string;
      plaid_error_code?: string;
      needs_reconnect: boolean;
    }> = [];
    let refreshed = 0;
    let skipped = 0;

    for (const item of items) {
      const rows = byItem.get(item.id) || [];
      const newest = rows.reduce<number | null>((best, row) => {
        if (!row.balances_updated_at) return best;
        const ts = new Date(row.balances_updated_at).getTime();
        if (!Number.isFinite(ts)) return best;
        return best == null ? ts : Math.max(best, ts);
      }, null);

      if (!force && newest != null && Date.now() - newest < MIN_REFRESH_MS) {
        skipped += 1;
        continue;
      }

      try {
        const live = await plaid("/accounts/balance/get", { access_token: item.access_token });
        const liveAccounts = (live.accounts || []) as Array<Record<string, unknown>>;
        for (const acc of liveAccounts) {
          const plaidAccountId = String(acc.account_id || "");
          const row = rows.find((r) => r.plaid_account_id === plaidAccountId);
          if (!row) continue;
          const fields = plaidBalanceFields(
            acc.balances as Record<string, unknown> | undefined,
            row.currency_code || "CAD",
          );
          const { error: upErr } = await supabase
            .from("plaid_accounts")
            .update(fields)
            .eq("id", row.id)
            .eq("user_id", user.id);
          if (upErr) throw upErr;
        }
        if (item.status !== "active") {
          await supabase.from("plaid_items").update({ status: "active" }).eq("id", item.id);
        }
        refreshed += 1;
      } catch (e) {
        const err = e as PlaidError;
        const message = err instanceof Error ? err.message : "Plaid balance refresh failed";
        const reconnect = needsReconnect(err.code, message);
        if (reconnect) {
          await supabase.from("plaid_items").update({ status: "login_required" }).eq("id", item.id);
        }
        errors.push({
          item_id: item.id,
          institution: item.institution_name,
          error: message,
          plaid_error_code: err.code,
          needs_reconnect: reconnect,
        });
      }
    }

    const { data: latest } = await supabase
      .from("plaid_accounts")
      .select(
        "id, name, mask, currency_code, available_balance, current_balance, balances_iso_currency, balances_updated_at, plaid_items(institution_name, status)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return jsonResponse({
      success: errors.length === 0,
      refreshed,
      skipped,
      accounts: latest || [],
      errors,
      plaid_env: PLAID_ENV,
    });
  } catch (e) {
    console.error("plaid-refresh-balances error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
