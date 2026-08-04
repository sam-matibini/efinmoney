import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { flwEncrypt3DesClient, getFlwEncryptionKey, getFlwV4EncryptionKey } from "../_shared/flw-encrypt.ts";
import {
  flwV4CreateCardMethod,
  flwV4CreateCharge,
  flwV4CreateCustomer,
  flwV4ErrorMessage,
  flwV4GetCharge,
  flwV4UpdateChargeAuthorization,
  isFlwV4Configured,
} from "../_shared/flw-v4.ts";

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

/** Find a challenge URL anywhere in the next_action payload (string or object shapes). */
function findActionUrl(node: unknown, depth = 0): string | null {
  if (depth > 4 || node == null) return null;
  if (typeof node === "string") return /^https?:\/\//i.test(node.trim()) ? node.trim() : null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findActionUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findActionUrl(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function normalizeNextAction(next: Record<string, unknown> | null | undefined) {
  if (!next) return null;
  const providerType = String(next.type || next.action || next.name || "").trim();
  const type = providerType.toLowerCase().replace(/[\s-]+/g, "_");
  // redirect_url may be a plain string, an object with .url, or nested deeper.
  const redirect = findActionUrl(next.redirect_url)
    || findActionUrl(next.redirect)
    || (typeof next.url === "string" ? next.url : null)
    || findActionUrl(next);

  let mode: "pin" | "otp" | "redirect" | "avs" | null = null;
  if (
    redirect ||
    type.includes("redirect") ||
    type.includes("3ds") ||
    type.includes("three_ds") ||
    type.includes("threeds") ||
    type.includes("secure_auth") ||
    type.includes("challenge") ||
    type.includes("payment_instruction") ||
    type.includes("authoriz")
  ) mode = "redirect";
  else if (type.includes("otp")) mode = "otp";
  else if (type.includes("pin")) mode = "pin";
  else if (type.includes("avs") || type.includes("address") || type.includes("billing")) mode = "avs";

  // A URL always wins — a hosted challenge page renders in the redirect panel.
  if (redirect) mode = "redirect";

  return { mode, providerType, redirect, rawType: type };
}


async function creditWallet(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  walletId: string | null | undefined;
  amount: number;
  currency: string;
  flwId: string;
  txRef: string;
}) {
  const creditedAmount = params.amount;
  const creditedCurrency = params.currency.toUpperCase();
  let targetWalletId = params.walletId ? String(params.walletId) : "";

  if (targetWalletId) {
    const { data: w } = await params.admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", targetWalletId).maybeSingle();
    if (!w || w.user_id !== params.userId || w.currency_code.toUpperCase() !== creditedCurrency) {
      targetWalletId = "";
    }
  }
  if (!targetWalletId) {
    const { data: wallet } = await params.admin.from("wallets").select("id")
      .eq("user_id", params.userId).eq("currency_code", creditedCurrency).maybeSingle();
    if (wallet) targetWalletId = wallet.id;
  }
  if (!targetWalletId) {
    const { data: nw } = await params.admin.from("wallets")
      .insert({ user_id: params.userId, currency_code: creditedCurrency, is_default: false })
      .select("id").single();
    if (nw) targetWalletId = nw.id;
  }
  if (!targetWalletId) return;

  const idempotencyRef = params.flwId || params.txRef;
  const { data: existing } = await params.admin.from("ledger_entries").select("id")
    .eq("reference_type", "flw_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return;

  const { data: asset } = await params.admin.from("ledger_accounts").select("id")
    .eq("currency_code", creditedCurrency).ilike("name", "Flutterwave Settlement%").limit(1).maybeSingle();
  const { data: liab } = await params.admin.from("ledger_accounts").select("id")
    .like("code", "21%").eq("currency_code", creditedCurrency)
    .ilike("name", "Customer Wallet Liability%").limit(1).maybeSingle();
  if (!asset || !liab) return;

  const journalId = crypto.randomUUID();
  const desc = `Card top-up via Flutterwave ${params.flwId}`;
  await params.admin.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: creditedCurrency,
      debit_amount: creditedAmount,
      credit_amount: 0,
      description: desc,
      reference_type: "flw_topup",
      external_reference: idempotencyRef,
    },
    {
      journal_id: journalId,
      account_id: liab.id,
      wallet_id: targetWalletId,
      currency_code: creditedCurrency,
      debit_amount: 0,
      credit_amount: creditedAmount,
      description: desc,
      reference_type: "flw_topup",
      external_reference: idempotencyRef,
    },
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });
    const userId = user.id;

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `flw_card:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const body = await req.json().catch(() => ({}));
    const {
      card_number,
      cvv,
      expiry_month,
      expiry_year,
      amount: rawAmount,
      currency: rawCurrency,
      fullname,
      email: rawEmail,
      wallet_id: walletId,
      billing_address,
      billing_city,
      billing_zip,
      pin,
      authorization,
      charge_id: existingChargeId,
    } = body as Record<string, unknown>;

    const amount = Number(rawAmount);
    const currency = String(rawCurrency || "USD").toUpperCase();
    const txRef = `efmcard-${userId.replace(/-/g, "").slice(0, 8)}-${Date.now().toString(36)}`;
    const redirectUrl = String(body?.redirect_url || "");

    if (!Number.isFinite(amount) || amount <= 0) return jr(400, { error: "Invalid amount" });
    if (!VALID_CARD_CURRENCIES.includes(currency)) {
      return jr(400, { error: `Currency ${currency} not supported for card payments` });
    }

    const cardNumber = String(card_number || "").replace(/\s/g, "");
    const cardCvv = String(cvv || "");
    const expiryMonth = String(expiry_month || "").padStart(2, "0");
    let expiryYearVal = String(expiry_year || "");
    if (expiryYearVal.length === 4) expiryYearVal = expiryYearVal.slice(-2);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (walletId) {
      const { data: w } = await admin.from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", String(walletId))
        .maybeSingle();
      if (!w || w.user_id !== userId) return jr(403, { error: "Wallet not accessible" });
      if (w.currency_code.toUpperCase() !== currency) {
        return jr(400, {
          error: `Wallet currency (${w.currency_code}) does not match payment currency (${currency})`,
        });
      }
    }

    const { data: profile } = await admin.from("profiles")
      .select("email, first_name, last_name, phone")
      .eq("user_id", userId)
      .maybeSingle();

    const customerName = String(fullname || "").trim() ||
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      "eFin User";
    const nameParts = customerName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "eFin";
    const lastName = nameParts.slice(1).join(" ") || "User";
    const customerEmail = String(rawEmail || profile?.email || `${userId}@efin.money`).trim();

    // ── V4 path (company account — not enabled for Rave v3) ─────────────
    if (isFlwV4Configured()) {
      if (!getFlwV4EncryptionKey()) {
        return ok({
          success: false,
          error:
            "Company Flutterwave is V4-only. Set FLW_ENCRYPTION_KEY to the base64 Encryption key from Flutterwave → Settings → API (not the old 24-char V3 key).",
          code: "missing_v4_encryption_key",
        });
      }

      // Follow-up PIN / OTP / AVS on an existing charge
      const authObj = authorization && typeof authorization === "object"
        ? authorization as Record<string, unknown>
        : null;
      const pinVal = pin ? String(pin) : (authObj?.pin != null ? String(authObj.pin) : "");
      const otpVal = authObj?.otp != null ? String(authObj.otp) : "";
      const avsObj = authObj?.avs && typeof authObj.avs === "object"
        ? authObj.avs as Record<string, unknown>
        : null;
      const avsVal = avsObj
        ? {
          address: avsObj.address != null ? String(avsObj.address) : undefined,
          city: avsObj.city != null ? String(avsObj.city) : undefined,
          state: avsObj.state != null ? String(avsObj.state) : undefined,
          country: avsObj.country != null ? String(avsObj.country) : undefined,
          zipcode: avsObj.zipcode != null ? String(avsObj.zipcode) : undefined,
        }
        : null;
      const chargeIdFollowUp = existingChargeId ? String(existingChargeId) : "";

      if (chargeIdFollowUp && (pinVal || otpVal || avsVal)) {
        // The provider owns the charge state. Re-read it before authorization so
        // authorization.type always matches the charge's current next_action.
        const current = await flwV4GetCharge(chargeIdFollowUp);
        if (!current.ok) {
          return ok({
            success: false,
            error: flwV4ErrorMessage(current.json, "Could not retrieve the current security check"),
            code: "charge_state_failed",
          });
        }
        const currentData = (current.json.data || {}) as Record<string, unknown>;
        const expected = normalizeNextAction(currentData.next_action as Record<string, unknown> | undefined);
        console.log("flw-card-charge follow-up state", {
          charge_id: chargeIdFollowUp,
          provider_status: current.status,
          charge_status: currentData.status ?? null,
          next_action_type: expected?.providerType ?? null,
          mapped_mode: expected?.mode ?? null,
          input_mode: pinVal ? "pin" : otpVal ? "otp" : "avs",
          raw_next_action: JSON.stringify(currentData.next_action ?? null),
          provider_message: currentData.next_action_message ?? currentData.message ?? null,
        });
        if (!expected?.mode) {
          const providerMessage = String(currentData.next_action_message || currentData.message || "");
          return ok({
            success: false,
            error: providerMessage ||
              (expected?.providerType
                ? `Unsupported bank security check: ${expected.providerType}. Please retry or use another payment method.`
                : "The bank did not return a supported security check. Please retry the payment."),
            provider_action_type: expected?.providerType || expected?.rawType || null,
            provider_message: providerMessage || null,
            charge_id: chargeIdFollowUp,
            code: "unsupported_auth_action",
          });
        }

        if (
          (pinVal && expected.mode !== "pin") ||
          (otpVal && expected.mode !== "otp") ||
          (avsVal && expected.mode !== "avs")
        ) {
          return ok({
            success: true,
            requires_auth: true,
            auth: {
              mode: expected.mode,
              provider_type: expected.providerType,
              redirect: expected.redirect,
              message: String(currentData.next_action_message || currentData.message || ""),
            },
            charge_id: chargeIdFollowUp,
            status: String(currentData.status || "pending"),
          });
        }

        const updated = await flwV4UpdateChargeAuthorization({
          chargeId: chargeIdFollowUp,
          authorizationType: expected.providerType,
          pin: pinVal || undefined,
          otp: otpVal || undefined,
          avs: avsVal || undefined,
        });
        if (!updated.ok) {
          return ok({
            success: false,
            error: flwV4ErrorMessage(updated.json, "Authorization failed"),
            code: "auth_failed",
          });
        }
        const data = (updated.json.data || {}) as Record<string, unknown>;
        const status = String(data.status || "").toLowerCase();
        if (["succeeded", "successful", "success", "completed"].includes(status)) {
          await creditWallet({
            admin,
            userId,
            walletId: walletId ? String(walletId) : null,
            amount: Number(data.amount || amount),
            currency: String(data.currency || currency),
            flwId: String(data.id || chargeIdFollowUp),
            txRef: String(data.reference || txRef),
          });
          return ok({
            success: true,
            verified: true,
            reference: String(data.reference || txRef),
            charge_id: String(data.id || chargeIdFollowUp),
            status,
            amount: Number(data.amount || amount),
            currency: String(data.currency || currency),
          });
        }
        const next = normalizeNextAction(data.next_action as Record<string, unknown> | undefined);
        if (next?.mode && next.providerType) {
          return ok({
            success: true,
            requires_auth: true,
            auth: {
              mode: next.mode,
              provider_type: next.providerType,
              redirect: next.redirect,
              message: String(data.next_action_message || data.message || ""),
            },
            reference: String(data.reference || txRef),
            charge_id: String(data.id || chargeIdFollowUp),
            status: String(data.status || "pending"),
          });
        }
        if (data.next_action) {
          console.log("flw-card-charge unsupported follow-up action", {
            charge_id: chargeIdFollowUp,
            next_action_type: next?.providerType || null,
          });
          return ok({
            success: false,
            error: `Unsupported bank security check: ${next?.providerType || "unknown"}. Please retry or use another payment method.`,
            provider_action_type: next?.providerType || null,
            code: "unsupported_auth_action",
          });
        }
        return ok({
          success: true,
          pending_verification: true,
          reference: String(data.reference || txRef),
          charge_id: String(data.id || chargeIdFollowUp),
          status: status || "pending",
        });
      }

      if (cardNumber.length < 13 || cardNumber.length > 19) return jr(400, { error: "Invalid card number" });
      if (!/^\d{2,4}$/.test(cardCvv)) return jr(400, { error: "Invalid CVV" });
      if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
        return jr(400, { error: "Invalid expiry month" });
      }
      if (!/^\d{2}$/.test(expiryYearVal)) return jr(400, { error: "Invalid expiry year" });

      const customer = await flwV4CreateCustomer({
        email: customerEmail,
        firstName,
        lastName,
      });
      if (!customer.customerId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(customer.json, "Could not create Flutterwave customer"),
          code: "customer_failed",
        });
      }

      const pm = await flwV4CreateCardMethod({
        cardNumber,
        expiryMonth,
        expiryYear: expiryYearVal,
        cvv: cardCvv,
      });
      if (!pm.paymentMethodId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(pm.json, "Card payment method failed"),
          code: "payment_method_failed",
        });
      }

      const charge = await flwV4CreateCharge({
        amount,
        currency,
        reference: txRef,
        customerId: customer.customerId,
        paymentMethodId: pm.paymentMethodId,
        redirectUrl: redirectUrl || undefined,
        meta: {
          user_id: userId,
          type: "wallet_topup",
          currency,
          ...(walletId ? { wallet_id: walletId } : {}),
          ...(billing_address ? { billing_address } : {}),
          ...(billing_city ? { billing_city } : {}),
          ...(billing_zip ? { billing_zip } : {}),
        },
      });

      if (!charge.ok && !charge.chargeId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(charge.json, "Card charge failed"),
          code: "charge_failed",
        });
      }

      const data = (charge.json.data || {}) as Record<string, unknown>;
      const status = String(data.status || "").toLowerCase();
      const next = normalizeNextAction(charge.nextAction || (data.next_action as Record<string, unknown>) || null);

      if (next) {
        if (!next.mode || !next.providerType) {
          console.log("flw-card-charge unsupported next action", {
            charge_id: charge.chargeId || data.id || null,
            provider_status: charge.status,
            next_action_type: next.providerType || null,
            raw_type: next.rawType || null,
          });
          return ok({
            success: false,
            error: `Unsupported bank security check: ${next.providerType || "unknown"}. Please retry or use another payment method.`,
            provider_action_type: next.providerType || null,
            charge_id: charge.chargeId || data.id || null,
            code: "unsupported_auth_action",
          });
        }


        console.log("flw-card-charge next action", {
          charge_id: charge.chargeId || data.id || null,
          provider_status: charge.status,
          next_action_type: next.providerType,
        });

        return ok({
          success: true,
          requires_auth: true,
          auth: {
            mode: next.mode,
            provider_type: next.providerType,
            redirect: next.redirect,
            message: String(data.next_action_message || data.message || ""),
          },
          reference: txRef,
          tx_ref: txRef,
          charge_id: charge.chargeId || data.id || null,
          message: flwV4ErrorMessage(charge.json, `Complete ${next.mode}`),
          status: status || "pending",
        });
      }

      if (["succeeded", "successful", "success", "completed"].includes(status)) {
        await creditWallet({
          admin,
          userId,
          walletId: walletId ? String(walletId) : null,
          amount: Number(data.amount || amount),
          currency: String(data.currency || currency),
          flwId: String(data.id || charge.chargeId || ""),
          txRef,
        });
        return ok({
          success: true,
          verified: true,
          reference: txRef,
          charge_id: charge.chargeId,
          status,
          amount: Number(data.amount || amount),
          currency: String(data.currency || currency),
        });
      }

      return ok({
        success: true,
        pending_verification: true,
        reference: txRef,
        charge_id: charge.chargeId,
        status: status || "pending",
        amount,
        currency,
      });
    }

    // ── V3 path (legacy merchants still on Rave v3) ─────────────────────
    const encKey = getFlwEncryptionKey();
    if (!encKey || encKey.length !== 24) {
      return ok({
        success: false,
        error: "Card payments require FLW_ENCRYPTION_KEY (24-char V3 key) or V4 OAuth + base64 encryption key.",
        code: "missing_encryption_key",
      });
    }

    if (cardNumber.length < 13 || cardNumber.length > 19) return jr(400, { error: "Invalid card number" });
    if (!/^\d{2,4}$/.test(cardCvv)) return jr(400, { error: "Invalid CVV" });
    if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
      return jr(400, { error: "Invalid expiry month" });
    }
    if (!/^\d{2}$/.test(expiryYearVal)) return jr(400, { error: "Invalid expiry year" });

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
      enckey: encKey,
      meta: {
        user_id: userId,
        type: "wallet_topup",
        currency,
        ...(walletId ? { wallet_id: walletId } : {}),
      },
    };
    if (billing_address) chargePayload.billingaddress = String(billing_address);
    if (billing_city) chargePayload.billingcity = String(billing_city);
    if (billing_zip) chargePayload.billingzip = String(billing_zip);
    if (authorization && typeof authorization === "object") {
      chargePayload.authorization = authorization;
    } else if (pin) {
      chargePayload.authorization = { mode: "pin", pin: String(pin) };
    }
    if (redirectUrl) chargePayload.redirect_url = redirectUrl;

    const client = flwEncrypt3DesClient(chargePayload, encKey);
    const { ok: success, status, json } = await flwV3Fetch("/charges?type=card", {
      method: "POST",
      body: JSON.stringify({ client }),
      timeoutMs: 30_000,
    });

    if (!success) {
      const msg = json?.message || json?.error || `Card charge failed (HTTP ${status})`;
      return ok({ success: false, error: msg, code: json?.status || "error", provider_status: status });
    }

    const data = json?.data || json;
    const authMode = data?.meta?.authorization?.mode || data?.authorization?.mode || null;
    const authRedirect = data?.meta?.authorization?.redirect || data?.authorization?.redirect || null;
    if (authMode) {
      return ok({
        success: true,
        requires_auth: true,
        auth: { mode: authMode, redirect: authRedirect || null, fields: [] },
        reference: txRef,
        charge_id: data?.id || null,
        flw_ref: data?.flw_ref || null,
        status: data?.status || "pending",
      });
    }

    const chargeStatus = String(data?.status || "").toLowerCase();
    const chargeId = String(data?.id || "");
    if (["successful", "success", "completed"].includes(chargeStatus)) {
      await creditWallet({
        admin,
        userId,
        walletId: walletId ? String(walletId) : null,
        amount: Number(data?.amount || amount),
        currency: String(data?.currency || currency),
        flwId: chargeId,
        txRef,
      });
    }

    return ok({
      success: true,
      verified: ["successful", "success", "completed"].includes(chargeStatus),
      reference: txRef,
      charge_id: chargeId,
      status: chargeStatus,
      amount: Number(data?.amount || amount),
      currency: String(data?.currency || currency),
    });
  } catch (err) {
    console.error("flw-card-charge error", err);
    return ok({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      transient: true,
    });
  }
});
