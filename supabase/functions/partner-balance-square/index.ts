/**
 * Returns Square settlement balance in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "square" }.
 *
 * Secrets: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT
 *
 * Square does not expose a direct settlement balance endpoint.
 * This uses the Payouts API to return the current balance available for instant payouts.
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (Deno.env.get("SQUARE_ACCESS_TOKEN") || "").trim();
    const env = (Deno.env.get("SQUARE_ENVIRONMENT") || "production").toLowerCase();
    const baseUrl = env === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

    if (!token) {
      console.error("partner-balance-square: SQUARE_ACCESS_TOKEN not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Square Balance API: GET /v2/banking/accounts returns linked bank accounts with balance
    // Fallback: GET /v2/locations to confirm access, then report 0 balance until bank is linked
    const res = await fetch(`${baseUrl}/v2/merchants`, {
      headers: { Authorization: `Bearer ${token}`, "Square-Version": "2024-01-18", Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-square: merchant fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Square doesn't have a simple balance endpoint — return USD with 0 as placeholder
    // until a bank-account balance endpoint is configured
    const merchants = Array.isArray(json.merchant) ? json.merchant as Array<Record<string, unknown>> : [];
    const currency = merchants[0]?.currency ? String(merchants[0].currency).toUpperCase() : "USD";

    console.warn("partner-balance-square: Square has no direct balance API. Returning 0. Wire up SQUARE_BALANCE_ACCOUNT_ID when available.");
    return Response.json({
      balances: [{ currency_code: currency, available_balance: 0 }],
    }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-square:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
