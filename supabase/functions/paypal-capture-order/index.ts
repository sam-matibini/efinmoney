/**
 * Capture a PayPal Order and credit the user's wallet.
 * Body: { orderID, walletId, currency?, amount? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { capturePayPalOrder, paypalConfigured } from "../_shared/paypal.ts";
import { creditWalletViaPayPal } from "../_shared/paypal-credit.ts";

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
    const orderId = String(body.orderID || body.orderId || body.order_id || "").trim();
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    const currencyHint = String(body.currency || "CAD").toUpperCase();

    if (!orderId) return jr(400, { error: "orderID required" });
    if (!walletId) return jr(400, { error: "walletId required" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return jr(403, { error: "Wallet not found" });

    const walletCcy = String(wallet.currency_code).toUpperCase();
    if (!SUPPORTED.has(walletCcy)) {
      return jr(400, { error: `Wallet currency ${walletCcy} not supported for PayPal` });
    }

    const captured = await capturePayPalOrder(orderId);
    if (!captured.ok) {
      console.error("paypal-capture-order failed", captured.error);
      return jr(400, { error: captured.error });
    }

    const creditCcy = captured.currency || currencyHint || walletCcy;
    if (creditCcy !== walletCcy) {
      return jr(400, {
        error: `Paid ${creditCcy} but wallet is ${walletCcy}`,
        payment_id: captured.captureId,
      });
    }
    if (!(captured.amount > 0)) {
      return jr(400, { error: "Invalid captured amount" });
    }

    const { already } = await creditWalletViaPayPal(
      admin,
      user.id,
      creditCcy,
      captured.amount,
      captured.captureId,
      walletId,
      `Wallet top-up via PayPal (${captured.captureId})`,
    );

    return jr(200, {
      success: true,
      credited: !already,
      already,
      payment_id: captured.captureId,
      order_id: orderId,
      status: captured.status,
      amount: captured.amount,
      currency: creditCcy,
    });
  } catch (err) {
    console.error("paypal-capture-order", err);
    return jr(500, { error: err instanceof Error ? err.message : "Capture failed" });
  }
});
