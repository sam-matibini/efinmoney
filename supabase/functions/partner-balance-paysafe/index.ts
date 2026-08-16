/**
 * Returns Paysafe account balance in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "paysafe" }.
 *
 * Secrets: PAYSAFE_API_KEY, PAYSAFE_ENV, PAYSAFE_ACCOUNT_ID
 *
 * NOTE: Set PAYSAFE_ACCOUNT_ID to your Paysafe merchant account ID.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { paysafeGet, PAYSAFE_BASE } from "../_shared/paysafe-client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = (Deno.env.get("PAYSAFE_API_KEY") || "").trim();
    const accountId = (Deno.env.get("PAYSAFE_ACCOUNT_ID") || "").trim();

    if (!apiKey) {
      console.error("partner-balance-paysafe: PAYSAFE_API_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }
    if (!accountId) {
      console.error("partner-balance-paysafe: PAYSAFE_ACCOUNT_ID not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Paysafe Account Management API — balance per merchant account
    const res = await paysafeGet(`/accountmanagement/v1/merchants/${encodeURIComponent(accountId)}/merchantaccounts`);

    if (!res.ok) {
      console.error("partner-balance-paysafe: merchant accounts fetch failed", res.status, res.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response: { merchantAccounts: [{ id, currencyCode, balance: { amount } }] }
    const accounts = Array.isArray(res.json?.merchantAccounts) ? res.json.merchantAccounts as Array<Record<string, unknown>> : [];
    const balances = accounts
      .filter((a) => a?.currencyCode)
      .map((a) => ({
        currency_code: String(a.currencyCode).toUpperCase(),
        available_balance: Number((a.balance as Record<string, unknown>)?.amount ?? a.balance ?? 0) / 100,
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-paysafe:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
