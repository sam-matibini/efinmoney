/**
 * Returns PawaPay wallet balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "pawapay" }.
 *
 * Secrets: PAWAPAY_API_TOKEN, PAWAPAY_BASE_URL
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (Deno.env.get("PAWAPAY_API_TOKEN") || "").trim();
    const baseUrl = (Deno.env.get("PAWAPAY_BASE_URL") || "https://api.pawapay.io").replace(/\/+$/, "");

    if (!token) {
      console.error("partner-balance-pawapay: PAWAPAY_API_TOKEN not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const res = await fetch(`${baseUrl}/wallet-balances`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json) {
      console.error("partner-balance-pawapay: wallet-balances failed", res.status, json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response: [{ country, operator, operatorBalances: [{ balance, currency, status }] }]
    const rows = Array.isArray(json) ? json as Array<Record<string, unknown>> : [];
    const totals = new Map<string, number>();
    for (const row of rows) {
      const opBalances = Array.isArray(row.operatorBalances) ? row.operatorBalances as Array<Record<string, unknown>> : [];
      for (const ob of opBalances) {
        if (String(ob.status ?? "").toUpperCase() !== "AVAILABLE") continue;
        const ccy = String(ob.currency || "").toUpperCase();
        if (!ccy) continue;
        totals.set(ccy, (totals.get(ccy) ?? 0) + Number(ob.balance ?? 0));
      }
    }

    const balances = Array.from(totals.entries()).map(([currency_code, available_balance]) => ({
      currency_code,
      available_balance,
    }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-pawapay:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
