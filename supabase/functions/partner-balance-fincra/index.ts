/**
 * Returns Fincra wallet balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "fincra" }.
 *
 * Secrets: FINCRA_SECRET_KEY, FINCRA_BUSINESS_ID, FINCRA_ENV, FINCRA_BASE_URL
 */
import { corsHeaders } from "../_shared/cors.ts";
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getFincraConfig();
    if (!cfg.secretKey) {
      console.error("partner-balance-fincra: FINCRA_SECRET_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // GET /disbursements/wallets returns all wallet balances for the business
    const res = await fincraFetch("/disbursements/wallets", { method: "GET" });

    if (!res.ok) {
      console.error("partner-balance-fincra: wallets fetch failed", res.status, res.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response shape: { success: true, data: [{ currency: "NGN", balance: 1234.56 }, ...] }
    const items: unknown[] = Array.isArray(res.json?.data)
      ? res.json.data
      : Array.isArray(res.json)
        ? res.json as unknown[]
        : [];

    const balances = items
      .filter((w: any) => w?.currency)
      .map((w: any) => ({
        currency_code: String(w.currency).toUpperCase(),
        available_balance: Number(w.balance ?? w.availableBalance ?? 0),
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-fincra:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
