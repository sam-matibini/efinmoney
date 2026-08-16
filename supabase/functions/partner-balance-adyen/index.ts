/**
 * Returns Adyen balance platform account balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "adyen" }.
 *
 * Secrets: ADYEN_API_KEY, ADYEN_BALANCE_ACCOUNT_ID (balance platform account id), ADYEN_ENV
 *
 * NOTE: Set ADYEN_BALANCE_ACCOUNT_ID to your Balance Platform balance account ID.
 * Find it in the Adyen Customer Area → Balance Platform → Balance accounts.
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = (Deno.env.get("ADYEN_API_KEY") || "").trim();
    const balanceAccountId = (Deno.env.get("ADYEN_BALANCE_ACCOUNT_ID") || "").trim();
    const env = (Deno.env.get("ADYEN_ENV") || "test").toLowerCase();
    const isLive = env === "live" || env === "production";

    if (!apiKey) {
      console.error("partner-balance-adyen: ADYEN_API_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }
    if (!balanceAccountId) {
      console.error("partner-balance-adyen: ADYEN_BALANCE_ACCOUNT_ID not set — set this to your Balance Platform account ID");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const baseUrl = isLive
      ? "https://balanceplatform-api-live.adyen.com/bcl/v2"
      : "https://balanceplatform-api-test.adyen.com/bcl/v2";

    const res = await fetch(`${baseUrl}/balanceAccounts/${encodeURIComponent(balanceAccountId)}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-adyen: balance account fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response: { balances: [{ balance: 1000, currency: "EUR", reserved: 0 }] }
    const items = Array.isArray(json.balances) ? json.balances as Array<Record<string, unknown>> : [];
    const balances = items
      .filter((b) => b?.currency)
      .map((b) => ({
        currency_code: String(b.currency).toUpperCase(),
        available_balance: Number(b.available ?? b.balance ?? 0) / 100,
        required_reserve: Number(b.reserved ?? 0) / 100,
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-adyen:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
