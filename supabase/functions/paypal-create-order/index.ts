/**
 * Create a PayPal Order (intent CAPTURE) for wallet top-up.
 * Body: { amount, currency, walletId }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createPayPalOrder, paypalConfigured } from "../_shared/paypal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });
    if (!paypalConfigured()) return jr(503, { error: "PayPal is not configured" });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    const currency = String(body.currency || "CAD").toUpperCase();
    const amount = Number(body.amount);

    if (!walletId) return jr(400, { error: "walletId required" });
    if (!SUPPORTED.has(currency)) return jr(400, { error: `Supports ${[...SUPPORTED].join(", ")}` });
    if (!Number.isFinite(amount) || amount < 1) return jr(400, { error: "Minimum top-up is 1.00" });
    if (amount > 50_000) return jr(400, { error: "Amount exceeds safety limit" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return jr(403, { error: "Wallet not found" });
    if (String(wallet.currency_code).toUpperCase() !== currency) {
      return jr(400, { error: `Wallet currency is ${wallet.currency_code}, not ${currency}` });
    }

    const customId = `efm|${user.id.slice(0, 8)}|${walletId}|${amount.toFixed(2)}|${currency}`;
    const created = await createPayPalOrder({
      amount,
      currency,
      customId,
      description: `eFinMoney ${currency} wallet top-up`,
    });
    if (!created.ok) return jr(400, { error: created.error });

    return jr(200, { orderID: created.orderId, orderId: created.orderId });
  } catch (err) {
    console.error("paypal-create-order", err);
    return jr(500, { error: err instanceof Error ? err.message : "Create order failed" });
  }
});
