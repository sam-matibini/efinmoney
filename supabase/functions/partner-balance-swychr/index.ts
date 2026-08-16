/**
 * Returns Swychr payout wallet balance in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "swychr" }.
 *
 * Secrets: SWYCHR_PAYOUT_EMAIL (or SWYCHR_EMAIL), SWYCHR_PAYOUT_PASSWORD (or SWYCHR_PASSWORD)
 */
import { corsHeaders } from "../_shared/cors.ts";
import { isSwychrConfigured, swychrSuiteBase } from "../_shared/swychr-auth.ts";

// Lazily import the full auth module to get the token
async function getSwychrPayoutToken(): Promise<string> {
  const { getSwychrToken } = await import("../_shared/swychr-auth.ts");
  return getSwychrToken("payout");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isSwychrConfigured("payout")) {
      console.error("partner-balance-swychr: SWYCHR_EMAIL/PASSWORD not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const token = await getSwychrPayoutToken();
    const base = swychrSuiteBase("payout");

    const res = await fetch(`${base}/wallet/balance`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-swychr: wallet balance fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response shape: { balance: 1234.56, currency: "XAF" } or { balances: [...] }
    const items: unknown[] = Array.isArray(json.balances) ? json.balances : [];
    const balances = items.length
      ? items
          .filter((b: any) => b?.currency)
          .map((b: any) => ({
            currency_code: String(b.currency).toUpperCase(),
            available_balance: Number(b.balance ?? b.available ?? 0),
          }))
      : json.currency
        ? [{ currency_code: String(json.currency).toUpperCase(), available_balance: Number(json.balance ?? 0) }]
        : [];

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-swychr:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
