// Flutterwave payment init — prefers V4 (OAuth) when FLW_CLIENT_ID is set,
// falls back to V3 hosted /payments when only FLW_SECRET_KEY is present.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import {
  flwV4CreateCharge,
  flwV4CreateCustomer,
  flwV4CreateMobileMoneyMethod,
  flwV4ErrorMessage,
  flwV4NormalizeNetwork,
  flwV4SplitPhone,
  isFlwV4Configured,
} from "../_shared/flw-v4.ts";

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
const ok = (body: unknown) => jr(200, body);

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

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const currency = String(body?.currency || "NGN").toUpperCase();
    const paymentMethod = String(body?.paymentMethod || "card"); // card | mobilemoney | banktransfer | ussd
    const redirectUrl = String(body?.redirectUrl || "");
    const phone = String(body?.phone || "").trim();
    const network = String(body?.network || "").toLowerCase();
    const country = String(body?.country || "").toUpperCase();
    const walletId = body?.walletId ? String(body.walletId) : "";
    const txType = String(body?.type || "wallet_topup");
    const clientTxRef = body?.tx_ref ? String(body.tx_ref) : "";

    if (walletId) {
      const { data: w } = await supabase
        .from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", walletId)
        .maybeSingle();
      if (!w || w.user_id !== userId) return jr(403, { error: "Wallet not accessible" });
      if (w.currency_code.toUpperCase() !== currency) {
        return jr(400, {
          error: `Wallet currency (${w.currency_code}) does not match top-up currency (${currency})`,
        });
      }
    }

    if (!Number.isFinite(amount) || amount <= 0) return jr(400, { error: "Invalid amount" });
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `flw_topup:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    if (paymentMethod === "mobilemoney" && currency === "NGN") {
      return jr(400, {
        error: "Nigeria does not support mobile money on Flutterwave. Please use bank transfer, USSD, or card instead.",
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("email, first_name, last_name, phone")
      .eq("user_id", userId)
      .maybeSingle();

    // V4 reference: ^[a-zA-Z0-9\-]+$ , 6–42 chars (underscores are rejected).
    const reference = clientTxRef && /^[a-zA-Z0-9-]{6,42}$/.test(clientTxRef)
      ? clientTxRef
      : `efmtopup-${userId.replace(/-/g, "").slice(0, 8)}-${Date.now().toString(36)}`;
    const customerEmail = profile?.email || `${userId}@efin.money`;
    const firstName = profile?.first_name || "eFin";
    const lastName = profile?.last_name || "User";
    const customerName =
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      (profile?.email ?? "eFin User");
    const customerPhone = phone || profile?.phone || "";

    // ── V4 path: mobile money only (company account is V4 for MoMo).
    // Card / bank / USSD use V3 hosted Standard checkout below (Sam: redirect
    // checkout enabled; direct charge needs PCI and is not used).
    if (isFlwV4Configured() && paymentMethod === "mobilemoney") {
      if (!customerPhone) {
        return jr(400, { error: "A mobile money phone number is required", code: "phone_required" });
      }

      const split = flwV4SplitPhone(customerPhone, currency);
      if (!split.ok) {
        return jr(400, { error: split.error, code: "phone_invalid" });
      }
      const { country_code, phone_number } = split;
      const v4Network = flwV4NormalizeNetwork(network || "", currency);

      const customer = await flwV4CreateCustomer({
        email: customerEmail,
        firstName,
        lastName,
        countryCode: country_code,
        phoneNumber: phone_number,
      });
      if (!customer.ok || !customer.customerId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(customer.json, "Could not create customer"),
          provider_status: customer.status,
          provider_response: customer.json,
        });
      }

      const pm = await flwV4CreateMobileMoneyMethod({
        countryCode: country_code,
        network: v4Network,
        phoneNumber: phone_number,
      });
      if (!pm.ok || !pm.paymentMethodId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(pm.json, "Could not create mobile money method"),
          provider_status: pm.status,
          provider_response: pm.json,
        });
      }

      const charge = await flwV4CreateCharge({
        amount,
        currency,
        reference,
        customerId: customer.customerId,
        paymentMethodId: pm.paymentMethodId,
        redirectUrl,
        meta: {
          user_id: userId,
          type: txType,
          currency,
          api: "v4",
          ...(walletId ? { wallet_id: walletId } : {}),
          ...(network ? { network } : {}),
          ...(country ? { country } : {}),
          phone: `${country_code}${phone_number}`,
        },
      });

      if (!charge.ok || !charge.chargeId) {
        return ok({
          success: false,
          error: flwV4ErrorMessage(charge.json, "Could not start mobile money charge"),
          provider_status: charge.status,
          provider_response: charge.json,
        });
      }

      const next = charge.nextAction || {};
      const redirect =
        (next as { type?: string; redirect_url?: { url?: string } }).type === "redirect_url"
          ? String((next as { redirect_url?: { url?: string } }).redirect_url?.url || "")
          : "";
      const instruction =
        (next as { type?: string; payment_instruction?: { note?: string } }).type ===
          "payment_instruction"
          ? String(
            (next as { payment_instruction?: { note?: string } }).payment_instruction?.note ||
              "Approve the payment on your phone.",
          )
          : "";

      return ok({
        success: true,
        api: "v4",
        payment_link: redirect || null,
        stk_push: !redirect,
        reference,
        tx_ref: reference,
        charge_id: charge.chargeId,
        next_action: next,
        message: instruction || (redirect ? "Redirecting to checkout…" : "Approve the payment on your phone."),
        status: String(((charge.json.data as Record<string, unknown>) || {}).status || "pending"),
      });
    }

    // ── V3 fallback (legacy FLWSECK) ───────────────────────────────────
    const payment_options =
      paymentMethod === "card"
        ? "card"
        : paymentMethod === "ussd"
        ? "ussd"
        : paymentMethod === "banktransfer"
        ? "banktransfer"
        : paymentMethod === "mobilemoney"
        ? (currency === "GHS"
          ? "mobilemoneyghana"
          : currency === "UGX"
          ? "mobilemoneyuganda"
          : currency === "KES"
          ? "mpesa"
          : currency === "TZS"
          ? "mobilemoneytanzania"
          : currency === "ZMW"
          ? "mobilemoneyzambia"
          : currency === "RWF"
          ? "mobilemoneyrwanda"
          : "card,mobilemoneyghana,mobilemoneyuganda,mpesa")
        : "card,banktransfer,ussd";

    const payload = {
      tx_ref: reference,
      amount: String(amount),
      currency,
      redirect_url: redirectUrl,
      payment_options,
      customer: { email: customerEmail, name: customerName, phonenumber: customerPhone },
      meta: {
        user_id: userId,
        type: txType,
        currency,
        ...(walletId ? { wallet_id: walletId } : {}),
        ...(network ? { network } : {}),
        ...(country ? { country } : {}),
        ...(phone ? { phone } : {}),
      },
      customizations: { title: "eFinMoney" },
    };

    const { ok: success, status, json } = await flwV3Fetch("/payments", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
    });

    if (!success) {
      const msg = json?.message || json?.error || `Failed to initialize payment (HTTP ${status})`;
      return ok({
        success: false,
        error: msg,
        transient: [0, 408, 502, 503, 504].includes(status),
        provider_status: status,
      });
    }

    return ok({
      success: true,
      api: "v3",
      payment_link: json?.data?.link,
      reference,
      tx_ref: reference,
    });
  } catch (err) {
    console.error("flw-initialize-payment error", err);
    return ok({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      transient: true,
    });
  }
});
