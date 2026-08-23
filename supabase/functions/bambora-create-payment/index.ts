/**
 * Charge a Bambora single-use card token and credit CAD/USD wallet.
 * Body: { token, name?, amount, currency, walletId, orderNumber?, saveCard? }
 *
 * Flow: charge token first, then optionally save profile from transaction id.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  bamboraChargeToken,
  bamboraCreateProfileFromTransaction,
  bamboraGetProfile,
  getBamboraConfig,
  isBamboraPaymentApproved,
  bamboraTxnId,
} from "../_shared/bambora.ts";
import { creditWalletViaBambora } from "../_shared/bambora-credit.ts";
import { bamboraCustomerCode, supportedBamboraCurrency } from "../_shared/bambora-auth.ts";
import { syncBamboraProfileToDb } from "../_shared/bambora-profiles-db.ts";

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
    const saveCard = Boolean(body.saveCard || body.save_card);
    const orderNumber = String(
      body.orderNumber || body.order_number || `efm${Date.now().toString(36)}`,
    ).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);

    if (!token) return jr(400, { error: "Card token required" });
    if (!walletId) return jr(400, { error: "walletId required" });
    if (!supportedBamboraCurrency(currency)) {
      return jr(400, { error: "Bambora top-up supports CAD and USD only" });
    }
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

    const charged = await bamboraChargeToken({
      token,
      name: cardName,
      amount,
      currency,
      orderNumber,
    });

    const approved = isBamboraPaymentApproved(charged.json);
    const txnId = bamboraTxnId(charged.json);
    const message = String(charged.json.message || charged.json.code || `HTTP ${charged.status}`);
    const authCode = charged.json.auth_code ?? null;
    const creditAmount = Number(charged.json.amount ?? amount);

    if (!charged.ok || !approved || !txnId) {
      console.error("bambora-create-payment declined", charged.status, charged.json);
      return jr(400, {
        error: message || "Card payment was not approved",
        bambora: {
          http_status: charged.status,
          code: charged.json.code ?? null,
          category: charged.json.category ?? null,
          message,
          details: charged.json.details ?? null,
        },
      });
    }

    let saved = false;
    if (saveCard && cfg.profilesPasscode) {
      const customerCode = bamboraCustomerCode(user.id);
      const existing = await bamboraGetProfile(customerCode);
      if (existing.status === 404) {
        const profileRes = await bamboraCreateProfileFromTransaction(customerCode, txnId);
        saved = profileRes.ok;
        if (!profileRes.ok) {
          console.warn("bambora save profile after charge failed", profileRes.json);
        }
      } else {
        saved = true;
      }
      try {
        await syncBamboraProfileToDb(admin, user.id, customerCode, currency);
      } catch (syncErr) {
        console.warn("bambora profile sync failed", syncErr);
      }
    }

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
      saved,
      transaction_id: txnId,
      order_number: orderNumber,
      amount: creditAmount,
      currency,
      auth_code: authCode,
      message,
    });
  } catch (err) {
    console.error("bambora-create-payment", err);
    return jr(500, { error: err instanceof Error ? err.message : "Payment failed" });
  }
});
