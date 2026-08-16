/**
 * Returns Circle (USDC) wallet balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "circle_cpn" }.
 *
 * Secrets: CIRCLE_API_KEY, CIRCLE_ENV
 */
import { corsHeaders } from "../_shared/cors.ts";
import { circleFetch, CIRCLE_API_KEY } from "../_shared/circle.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CIRCLE_API_KEY) {
      console.error("partner-balance-circle: CIRCLE_API_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // GET /v1/configuration returns account details including balances
    const res = await circleFetch<Record<string, unknown>>({ path: "/v1/wallets" });

    if (!res.ok || !res.data) {
      console.error("partner-balance-circle: wallets fetch failed", res.status, res.error);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response: { data: { wallets: [{ walletId, balances: [{ amount, currency }] }] } }
    const wallets: unknown[] = Array.isArray((res.data as any)?.data)
      ? (res.data as any).data
      : [];

    const totals = new Map<string, number>();
    for (const w of wallets as Array<Record<string, unknown>>) {
      const bals = Array.isArray(w.balances) ? w.balances as Array<Record<string, unknown>> : [];
      for (const b of bals) {
        const ccy = String(b.currency || "").toUpperCase();
        if (!ccy) continue;
        totals.set(ccy, (totals.get(ccy) ?? 0) + Number(b.amount ?? 0));
      }
    }

    const balances = Array.from(totals.entries()).map(([currency_code, available_balance]) => ({
      currency_code,
      available_balance,
    }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-circle:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
