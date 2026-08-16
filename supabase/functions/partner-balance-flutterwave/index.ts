/**
 * Returns Flutterwave account balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "flutterwave" }.
 *
 * Secrets: FLW_SECRET_KEY, FLW_PROXY_URL (optional), FLW_USE_PROXY
 */
import { corsHeaders } from "../_shared/cors.ts";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = (Deno.env.get("FLW_SECRET_KEY") || "").trim();
    if (!secret) {
      console.error("partner-balance-flutterwave: FLW_SECRET_KEY not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // GET /v3/balances returns all currency balances for the account
    const res = await flwV3Fetch("/balances", { method: "GET" });

    if (!res.ok) {
      console.error("partner-balance-flutterwave: balances fetch failed", res.status, res.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Response: { status: "success", data: [{ currency: "NGN", available_balance: 1234.56, ledger_balance: 1250 }] }
    const items: unknown[] = Array.isArray(res.json?.data) ? res.json.data : [];
    const balances = items
      .filter((b: any) => b?.currency)
      .map((b: any) => ({
        currency_code: String(b.currency).toUpperCase(),
        available_balance: Number(b.available_balance ?? b.availableBalance ?? 0),
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-flutterwave:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
