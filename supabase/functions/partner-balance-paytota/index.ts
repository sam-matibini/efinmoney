/**
 * Returns Paytota merchant balance in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "paytota" }.
 *
 * Secrets: PAYTOTA_SECRET_KEY, PAYTOTA_BRAND_ID, PAYTOTA_BASE_URL
 */
import { corsHeaders } from "../_shared/cors.ts";
import { getPaytotaConfig, isPaytotaConfigured } from "../_shared/paytota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getPaytotaConfig();
    if (!isPaytotaConfigured()) {
      console.error("partner-balance-paytota: PAYTOTA_SECRET_KEY or PAYTOTA_BRAND_ID not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Paytota balance endpoint
    const res = await fetch(`${cfg.baseUrl}/api/v1/merchant/balance`, {
      method: "GET",
      headers: {
        "x-secret-key": cfg.secretKey,
        "x-brand-id": cfg.brandId,
        Accept: "application/json",
      },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-paytota: balance fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response shape varies — adapt to common patterns
    const data = (json.data ?? json) as Record<string, unknown>;
    const items: unknown[] = Array.isArray(data) ? data : [data];
    const balances = items
      .filter((b: any) => b?.currency || b?.currencyCode)
      .map((b: any) => ({
        currency_code: String(b.currency || b.currencyCode || "USD").toUpperCase(),
        available_balance: Number(b.balance ?? b.availableBalance ?? b.available ?? 0),
      }));

    if (!balances.length && typeof data.balance === "number") {
      balances.push({ currency_code: "USD", available_balance: data.balance as number });
    }

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-paytota:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
