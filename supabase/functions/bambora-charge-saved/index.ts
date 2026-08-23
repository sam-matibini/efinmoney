/**
 * Charge a saved Bambora payment profile card.
 * Body: { methodId?, customerCode?, cardId?, amount, currency, walletId }
 */
import {
  bamboraChargeProfile,
  getBamboraConfig,
  isBamboraPaymentApproved,
  bamboraTxnId,
} from "../_shared/bambora.ts";
import { creditWalletViaBambora } from "../_shared/bambora-credit.ts";
import {
  corsHeaders,
  json,
  requireUser,
  supportedBamboraCurrency,
  validateTopupAmount,
} from "../_shared/bambora-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    const cfg = getBamboraConfig();
    if (!cfg.merchantId || !cfg.paymentsPasscode) {
      return json(503, { error: "Bambora payments not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const methodId = String(body.methodId || body.method_id || "").trim();
    const amount = Number(body.amount);
    const currency = String(body.currency || "CAD").toUpperCase();
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    let customerCode = String(body.customerCode || body.customer_code || "").trim();
    let cardId = Number(body.cardId || body.card_id || 0);

    const amtErr = validateTopupAmount(amount, currency);
    if (amtErr) return json(400, { error: amtErr });
    if (!walletId) return json(400, { error: "walletId required" });
    if (!supportedBamboraCurrency(currency)) {
      return json(400, { error: "Bambora supports CAD and USD only" });
    }

    if (methodId) {
      const { data: method } = await admin.from("bambora_payment_methods")
        .select("*")
        .eq("id", methodId)
        .eq("user_id", user.id)
        .eq("method_type", "card")
        .maybeSingle();
      if (!method) return json(404, { error: "Saved card not found" });
      customerCode = String(method.customer_code);
      cardId = Number(method.bambora_card_id);
    }
    if (!customerCode || !cardId) return json(400, { error: "Saved card reference required" });

    const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return json(403, { error: "Wallet not found" });
    if (String(wallet.currency_code).toUpperCase() !== currency) {
      return json(400, { error: `Wallet currency is ${wallet.currency_code}` });
    }

    const orderNumber = String(body.orderNumber || `efm${Date.now().toString(36)}`)
      .replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);

    const charged = await bamboraChargeProfile({
      customerCode,
      cardId,
      amount,
      currency,
      orderNumber,
    });

    const approved = isBamboraPaymentApproved(charged.json);
    const txnId = bamboraTxnId(charged.json);
    const message = String(charged.json.message || charged.json.code || `HTTP ${charged.status}`);

    if (!charged.ok || !approved || !txnId) {
      return json(400, {
        error: message || "Card payment was not approved",
        bambora: charged.json,
      });
    }

    const creditAmount = Number(charged.json.amount ?? amount);
    const { already } = await creditWalletViaBambora(
      admin,
      user.id,
      currency,
      creditAmount,
      `bambora:${txnId}`,
      walletId,
      `Wallet top-up via Bambora saved card (${txnId})`,
    );

    return json(200, {
      success: true,
      credited: !already,
      already,
      transaction_id: txnId,
      amount: creditAmount,
      currency,
      message,
    });
  } catch (err) {
    console.error("bambora-charge-saved", err);
    return json(500, { error: err instanceof Error ? err.message : "Charge failed" });
  }
});
