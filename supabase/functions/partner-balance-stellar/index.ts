/**
 * Returns Stellar account balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "stellar" }.
 *
 * Secrets: STELLAR_PAYOUT_PUBLIC_KEY (the G... address holding payout liquidity)
 *          STELLAR_HORIZON_URL (optional, default https://horizon.stellar.org)
 *          STELLAR_USDC_ISSUER (optional, for USDC asset filter)
 */
import { corsHeaders } from "../_shared/cors.ts";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const publicKey = (Deno.env.get("STELLAR_PAYOUT_PUBLIC_KEY") || "").trim();
    const horizonUrl = (Deno.env.get("STELLAR_HORIZON_URL") || "https://horizon.stellar.org").replace(/\/+$/, "");
    const usdcIssuer = (Deno.env.get("STELLAR_USDC_ISSUER") || USDC_ISSUER).trim();

    if (!publicKey) {
      console.error("partner-balance-stellar: STELLAR_PAYOUT_PUBLIC_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const res = await fetch(`${horizonUrl}/accounts/${encodeURIComponent(publicKey)}`, {
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-stellar: account fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Stellar balances: [{ balance: "1234.5600000", asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "..." }]
    const rawBalances = Array.isArray(json.balances) ? json.balances as Array<Record<string, unknown>> : [];
    const balances = rawBalances
      .filter((b) => {
        if (b.asset_type === "native") return true;
        if (b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12") {
          // Only include USDC from the known issuer
          return b.asset_code === "USDC" && b.asset_issuer === usdcIssuer;
        }
        return false;
      })
      .map((b) => ({
        currency_code: b.asset_type === "native" ? "XLM" : String(b.asset_code).toUpperCase(),
        available_balance: Number(b.balance ?? 0),
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-stellar:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
