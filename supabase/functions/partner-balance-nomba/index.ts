/**
 * Returns Nomba account balance in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "nomba" }.
 *
 * Secrets: NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID, NOMBA_API_BASE, NOMBA_ENV
 */
import { corsHeaders } from "../_shared/cors.ts";
import { getNombaApiConfig, nombaApiConfigured, nombaApiFetch } from "../_shared/nomba-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getNombaApiConfig();
    if (!nombaApiConfigured(cfg)) {
      console.error("partner-balance-nomba: NOMBA_CLIENT_ID/SECRET/ACCOUNT_ID not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // GET /v1/accounts/balance returns the main account balance
    const res = await nombaApiFetch("/v1/accounts/balance", { method: "GET" });

    if (!res.ok) {
      console.error("partner-balance-nomba: balance fetch failed", res.status, res.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const data = res.json?.data ?? res.json ?? {};
    // Nomba returns { availableBalance, ledgerBalance, currency }
    const currency = String(data.currency || "NGN").toUpperCase();
    const available = Number(data.availableBalance ?? data.available_balance ?? 0);

    return Response.json({
      balances: [{ currency_code: currency, available_balance: available }],
    }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-nomba:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
