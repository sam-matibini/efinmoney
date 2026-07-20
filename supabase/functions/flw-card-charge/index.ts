import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const ok = (body: unknown) => jr(200, body);

const VALID_CARD_CURRENCIES = ["NGN", "USD", "KES", "UGX", "GHS", "ZMW", "RWF", "TZS", "CAD", "GBP", "EUR"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });
    const userId = user.id;

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `flw_card:${userId}`, p_max_requests: 10, p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const body = await req.json().catch(() => ({}));
    const {
      card_number, cvv, expiry_month, expiry_year,
      amount: rawAmount, currency: rawCurrency,
      fullname, email: rawEmail,
      wallet_id: walletId,
      billing_address, billing_city, billing_zip,
      pin, authorization,
    } = body as Record<string, unknown>;

    const amount = Number(rawAmount);
    const currency = String(rawCurrency || "USD").toUpperCase();
    const txRef = `efm_card_${userId.slice(0, 8)}_${Date.now()}`;
    const redirectUrl = String(body?.redirect_url || "");

    if (!Number.isFinite(amount) || amount <= 0) return jr(400, { error: "Invalid amount" });
    if (!VALID_CARD_CURRENCIES.includes(currency)) return jr(400, { error: `Currency ${currency} not supported for card payments` });

    const cardNumber = String(card_number || "").replace(/\s/g, "");
    const cardCvv = String(cvv || "");
    const expiryMonth = String(expiry_month || "").padStart(2, "0");
    const expiryYearVal = String(expiry_year || "");

    if (cardNumber.length < 13 || cardNumber.length > 19) return jr(400, { error: "Invalid card number" });
    if (!/^\d{2,4}$/.test(cardCvv)) return jr(400, { error: "Invalid CVV" });
    if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) return jr(400, { error: "Invalid expiry month" });
    if (!/^\d{2,4}$/.test(expiryYearVal)) return jr(400, { error: "Invalid expiry year" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (walletId) {
      const { data: w } = await admin.from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", String(walletId)).maybeSingle();
      if (!w || w.user_id !== userId) return jr(403, { error: "Wallet not accessible" });
      if (w.currency_code.toUpperCase() !== currency) {
        return jr(400, { error: `Wallet currency (${w.currency_code}) does not match payment currency (${currency})` });
      }
    }

    const { data: profile } = await admin.from("profiles")
      .select("email, first_name, last_name, phone")
      .eq("user_id", userId).maybeSingle();

    const customerName = String(fullname || "").trim() ||
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      "eFin User";
    const customerEmail = String(rawEmail || profile?.email || `${userId}@efin.money`).trim();

    const chargePayload: Record<string, unknown> = {
      card_number: cardNumber,
      cvv: cardCvv,
      expiry_month: expiryMonth,
      expiry_year: expiryYearVal,
      currency,
      amount: String(amount),
      fullname: customerName,
      email: customerEmail,
      tx_ref: txRef,
      enckey: Deno.env.get("FLW_ENCRYPTION_KEY") || undefined,
      meta: { user_id: userId, type: "wallet_topup", currency, ...(walletId ? { wallet_id: walletId } : {}) },
    };

    if (billing_address) chargePayload.billingaddress = String(billing_address);
    if (billing_city) chargePayload.billingcity = String(billing_city);
    if (billing_zip) chargePayload.billingzip = String(billing_zip);

    // Handle second-step auth (pin, etc.)
    if (authorization && typeof authorization === "object") {
      chargePayload.authorization = authorization;
    } else if (pin) {
      chargePayload.authorization = { mode: "pin", pin: String(pin) };
    }

    if (redirectUrl) {
      chargePayload.redirect_url = redirectUrl;
    }

    const { ok: success, status, json } = await flwV3Fetch("/charges?type=card", {
      method: "POST",
      body: JSON.stringify(chargePayload),
      timeoutMs: 30_000,
    });

    if (!success) {
      const msg = json?.message || json?.error || `Card charge failed (HTTP ${status})`;
      const suggestion = json?.data?.processor_response || json?.data?.suggested_auth || "";
      return ok({
        success: false,
        error: suggestion ? `${msg} — ${suggestion}` : msg,
        transient: [0, 408, 502, 503, 504].includes(status),
        code: json?.status || "error",
        provider_status: status,
      });
    }

    const data = json?.data || json;

    // Check if further authorization is needed (PIN, OTP, 3DS redirect, etc.)
    const authMode = data?.meta?.authorization?.mode || data?.authorization?.mode || null;
    const authRedirect = data?.meta?.authorization?.redirect || data?.authorization?.redirect || null;
    const authFields = data?.meta?.authorization?.fields || data?.authorization?.fields || [];

    if (authMode) {
      return ok({
        success: true,
        requires_auth: true,
        auth: {
          mode: authMode,
          redirect: authRedirect || null,
          fields: authFields,
        },
        reference: txRef,
        tx_ref: txRef,
        charge_id: data?.id || null,
        flw_ref: data?.flw_ref || null,
        message: data?.message || `Enter ${authMode}`,
        status: data?.status || "pending",
      });
    }

    // Direct success — verify and credit
    const chargeStatus = String(data?.status || "").toLowerCase();
    const chargeId = String(data?.id || "");
    const flwRef = String(data?.flw_ref || "");

    // Verify the transaction
    const verifyPath = chargeId
      ? `/transactions/${encodeURIComponent(chargeId)}/verify`
      : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
    const { ok: vOk, json: vJson } = await flwV3Fetch(verifyPath, { method: "GET" });

    if (!vOk || !vJson?.data) {
      return ok({
        success: true,
        pending_verification: true,
        reference: txRef,
        tx_ref: txRef,
        charge_id: chargeId,
        flw_ref: flwRef,
        status: chargeStatus,
        amount: data?.amount || amount,
        currency: data?.currency || currency,
      });
    }

    const vData = vJson.data;
    const vStatus = String(vData?.status || "").toLowerCase();

    if (vStatus === "successful" || vStatus === "success" || vStatus === "completed") {
      // Credit wallet via ledger (same pattern as flw-verify-payment)
      const creditedAmount = Number(vData?.amount || amount);
      const creditedCurrency = String(vData?.currency || currency).toUpperCase();
      const ref = String(vData?.tx_ref || txRef);
      const flwId = String(vData?.id || chargeId);

      let targetWalletId = walletId ? String(walletId) : "";
      if (targetWalletId) {
        const { data: w } = await admin.from("wallets").select("id, user_id, currency_code")
          .eq("id", targetWalletId).maybeSingle();
        if (!w || w.user_id !== userId || w.currency_code.toUpperCase() !== creditedCurrency) {
          targetWalletId = "";
        }
      }
      if (!targetWalletId) {
        const { data: wallet } = await admin.from("wallets").select("id")
          .eq("user_id", userId).eq("currency_code", creditedCurrency).maybeSingle();
        if (wallet) targetWalletId = wallet.id;
      }
      if (!targetWalletId) {
        const { data: nw } = await admin.from("wallets")
          .insert({ user_id: userId, currency_code: creditedCurrency, is_default: false })
          .select("id").single();
        if (nw) targetWalletId = nw.id;
      }

      if (targetWalletId) {
        const idempotencyRef = flwId || ref;
        const { data: existing } = await admin.from("ledger_entries").select("id")
          .eq("reference_type", "flw_topup").eq("external_reference", idempotencyRef).limit(1);

        if (!existing || existing.length === 0) {
          const { data: asset } = await admin.from("ledger_accounts").select("id")
            .eq("currency_code", creditedCurrency).ilike("name", "Flutterwave Settlement%").limit(1).maybeSingle();
          const { data: liab } = await admin.from("ledger_accounts").select("id")
            .like("code", "21%").eq("currency_code", creditedCurrency).ilike("name", "Customer Wallet Liability%").limit(1).maybeSingle();

          if (asset && liab) {
            const journalId = crypto.randomUUID();
            const desc = `Card top-up via Flutterwave ${flwId}`;
            await admin.from("ledger_entries").insert([
              { journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: creditedCurrency, debit_amount: creditedAmount, credit_amount: 0, description: desc, reference_type: "flw_topup", external_reference: idempotencyRef },
              { journal_id: journalId, account_id: liab.id, wallet_id: targetWalletId, currency_code: creditedCurrency, debit_amount: 0, credit_amount: creditedAmount, description: desc, reference_type: "flw_topup", external_reference: idempotencyRef },
            ]);
          }
        }
      }
    }

    return ok({
      success: true,
      verified: vStatus === "successful" || vStatus === "success" || vStatus === "completed",
      reference: txRef,
      tx_ref: txRef,
      charge_id: chargeId,
      flw_ref: flwRef,
      status: vStatus || chargeStatus,
      amount: creditedAmount || data?.amount || amount,
      currency: creditedCurrency || data?.currency || currency,
    });
  } catch (err) {
    console.error("flw-card-charge error", err);
    return ok({ success: false, error: err instanceof Error ? err.message : "Unknown error", transient: true });
  }
});
