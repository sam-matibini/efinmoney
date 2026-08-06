/**
 * Verify a Square Checkout payment after redirect and credit the wallet.
 * Body: { orderId }  (from Square redirect query param orderId)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { squareConfigured, squareFetch } from "../_shared/square.ts";
import { creditWalletViaSquare } from "../_shared/square-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });
    if (!squareConfigured()) return jr(503, { error: "Square is not configured" });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.orderId || body.order_id || "").trim();
    if (!orderId) return jr(400, { error: "orderId required" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let { data: intent } = await admin.from("square_checkout_intents")
      .select("*")
      .eq("order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    // Recover if intent row was missing at create-time (payment_note on Payment)
    if (!intent) {
      const paySearch = await squareFetch(
        `/v2/payments?order_id=${encodeURIComponent(orderId)}&limit=5`,
        { method: "GET" },
      );
      const payments = (paySearch.json?.payments as Array<Record<string, unknown>> | undefined) || [];
      const note = String(payments[0]?.note || "");
      // efm-topup|intentId|walletId|userId|amount|currency
      const parts = note.split("|");
      if (parts[0] === "efm-topup" && parts[3] === user.id && parts[2]) {
        intent = {
          id: parts[1] || crypto.randomUUID(),
          user_id: user.id,
          wallet_id: parts[2],
          amount: Number(parts[4]) || 0,
          currency: String(parts[5] || "CAD").toUpperCase(),
          status: "pending",
          order_id: orderId,
        };
      }
    }

    if (!intent) {
      return jr(404, { error: "Checkout session not found for this order", success: false });
    }

    if (intent.status === "completed") {
      return jr(200, {
        success: true,
        already: true,
        amount: Number(intent.amount),
        currency: intent.currency,
        message: "Payment already credited",
      });
    }

    // Load order — after pay, state is OPEN and tenders include payment id
    const orderRes = await squareFetch(`/v2/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
    if (!orderRes.ok) {
      return jr(400, {
        success: false,
        message: String(orderRes.json?.errors?.[0]?.detail || "Could not load Square order"),
      });
    }

    const order = (orderRes.json?.order ?? {}) as Record<string, unknown>;
    const state = String(order.state || "").toUpperCase();
    const tenders = (order.tenders as Array<Record<string, unknown>> | undefined) || [];

    if (state !== "OPEN" && state !== "COMPLETED" && tenders.length === 0) {
      return jr(200, {
        success: false,
        message: `Payment not completed yet (order ${state || "unknown"})`,
      });
    }

    let paymentId = "";
    for (const t of tenders) {
      const pid = String(t.payment_id || t.id || "");
      if (pid) {
        paymentId = pid;
        break;
      }
    }

    // Fallback: search payments by order
    if (!paymentId) {
      const paySearch = await squareFetch(
        `/v2/payments?order_id=${encodeURIComponent(orderId)}&limit=5`,
        { method: "GET" },
      );
      const payments = (paySearch.json?.payments as Array<Record<string, unknown>> | undefined) || [];
      const completed = payments.find((p) => ["COMPLETED", "APPROVED"].includes(String(p.status || "").toUpperCase()));
      paymentId = String(completed?.id || payments[0]?.id || "");
    }

    if (!paymentId) {
      return jr(200, {
        success: false,
        message: "Waiting for Square payment confirmation…",
      });
    }

    const payRes = await squareFetch(`/v2/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
    const payment = (payRes.json?.payment ?? {}) as Record<string, unknown>;
    const payStatus = String(payment.status || "").toUpperCase();
    if (!["COMPLETED", "APPROVED"].includes(payStatus)) {
      return jr(200, {
        success: false,
        message: `Payment status ${payStatus || "unknown"}`,
      });
    }

    const currency = String(intent.currency).toUpperCase();
    const paidMinor = Number((payment.amount_money as { amount?: number } | undefined)?.amount);
    const zeroDecimal = new Set(["JPY", "KRW", "VND"]);
    const creditAmount = Number.isFinite(paidMinor)
      ? (zeroDecimal.has(currency) ? paidMinor : paidMinor / 100)
      : Number(intent.amount);

    const { already } = await creditWalletViaSquare(
      admin,
      user.id,
      currency,
      creditAmount,
      paymentId,
      String(intent.wallet_id),
      `Wallet top-up via Square Checkout (${paymentId})`,
    );

    await admin.from("square_checkout_intents").update({
      status: "completed",
      payment_id: paymentId,
      completed_at: new Date().toISOString(),
    }).eq("id", intent.id);

    return jr(200, {
      success: true,
      already,
      amount: creditAmount,
      currency,
      payment_id: paymentId,
      message: already ? "Payment already credited" : "Wallet credited",
    });
  } catch (err) {
    console.error("square-verify-checkout", err);
    return jr(500, { error: err instanceof Error ? err.message : "Verify failed", success: false });
  }
});
