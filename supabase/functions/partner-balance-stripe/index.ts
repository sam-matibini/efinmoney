/**
 * Returns Stripe account balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "stripe" }.
 *
 * Secrets: STRIPE_SECRET_KEY
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secretKey = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
    if (!secretKey) {
      console.error("partner-balance-stripe: STRIPE_SECRET_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("partner-balance-stripe: balance fetch failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // available: [{ amount: 1000, currency: "usd" }] — amounts are in minor units (cents)
    const available = Array.isArray(json.available) ? json.available as Array<Record<string, unknown>> : [];
    const balances = available
      .filter((a) => a?.currency)
      .map((a) => ({
        currency_code: String(a.currency).toUpperCase(),
        // Stripe amounts are in smallest currency unit — divide by 100 for major units
        available_balance: Number(a.amount ?? 0) / 100,
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-stripe:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
