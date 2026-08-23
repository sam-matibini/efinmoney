/**
 * Charge a Bambora single-use card token and credit the CAD wallet.
 * Body: { token, name?, amount, currency, walletId, orderNumber? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { bamboraFetch, getBamboraConfig } from "../_shared/bambora.ts";
import { creditWalletViaBambora } from "../_shared/bambora-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const cfg = getBamboraConfig();
    if (!cfg.merchantId || !cfg.paymentsPasscode) {
      return jr(503, { error: "Bambora payments not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || body.token_code || "").trim();
    const cardName = String(body.name || body.card_name || "Cardholder").trim() || "Cardholder";
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    const currency = String(body.currency || "CAD").toUpperCase();
    const amount = Number(body.amount);
    const orderNumber = String(
      body.orderNumber || body.order_number || `efm${Date.now().toString(36)}`,
    ).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);

    if (!token) return jr(400, { error: "Card token required" });
    if (!walletId) return jr(400, { error: "walletId required" });
    if (currency !== "CAD") return jr(400, { error: "Bambora top-up is CAD only for now" });
    if (!Number.isFinite(amount) || !(amount >= 1)) return jr(400, { error: "Minimum amount is 1.00" });
    if (amount > 25_000) return jr(400, { error: "Amount exceeds safety limit" });

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

    const amountStr = amount.toFixed(2);
    const paymentBody = {
      amount: Number(amountStr),
      currency,
      payment_method: "token",
      order_number: orderNumber,
      token: {
        name: cardName.slice(0, 64),
        code: token,
        complete: true,
      },
    };

    const charged = await bamboraFetch("/v1/payments", {
      method: "POST",
      body: JSON.stringify(paymentBody),
      kind: "payments",
      timeoutMs: 45_000,
    });

    const approved =
      String(charged.json.approved ?? "") === "1"
      || String(charged.json.message || "").toLowerCase() === "approved";
    const txnId = String(charged.json.id || charged.json.transaction_id || "");
    const message = String(charged.json.message || charged.json.code || `HTTP ${charged.status}`);

    if (!charged.ok || !approved || !txnId) {
      console.error("bambora-create-payment declined", charged.status, charged.json);
      return jr(400, {
        error: message || "Card payment was not approved",
        bambora: {
          http_status: charged.status,
          code: charged.json.code ?? null,
          category: charged.json.category ?? null,
          message,
        },
      });
    }

    const creditAmount = Number(charged.json.amount ?? amountStr);
    const { already } = await creditWalletViaBambora(
      admin,
      user.id,
      currency,
      creditAmount,
      `bambora:${txnId}`,
      walletId,
      `Wallet top-up via Bambora (${txnId})`,
    );

    return jr(200, {
      success: true,
      credited: !already,
      already,
      transaction_id: txnId,
      order_number: orderNumber,
      amount: creditAmount,
      currency,
      auth_code: charged.json.auth_code ?? null,
      message,
    });
  } catch (err) {
    console.error("bambora-create-payment", err);
    return jr(500, { error: err instanceof Error ? err.message : "Payment failed" });
  }
});
