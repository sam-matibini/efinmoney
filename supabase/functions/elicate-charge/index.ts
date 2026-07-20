import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  elicateCharge,
  extractRedirectUrl,
  extractTransactionId,
  getElicateConfig,
} from "../_shared/elicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NETWORK_MAP: Record<string, string> = {
  mtn: "MTN",
  mtn_mobile: "MTN",
  mtn_zambia: "MTN",
  mtn_money: "MTN",
  airtel: "AIRTEL",
  airtel_money: "AIRTEL",
  airtel_zambia: "AIRTEL",
  zamtel: "ZAMTEL",
  zamtel_money: "ZAMTEL",
};

function resolveNetwork(input?: string | null): string {
  if (!input) return "MTN";
  const key = String(input).toLowerCase();
  if (NETWORK_MAP[key]) return NETWORK_MAP[key];
  if (key.includes("mtn")) return "MTN";
  if (key.includes("airtel")) return "AIRTEL";
  if (key.includes("zamtel")) return "ZAMTEL";
  return String(input).toUpperCase();
}

function normalizeZmPhone(raw?: string | null): string {
  let phone = String(raw || "").replace(/[^\d]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("260")) phone = phone.slice(3);
  if (!phone.startsWith("0")) phone = "0" + phone;
  return phone;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await userClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      amount,
      target_wallet_id = null,
      phone,
      network,
      customer_name,
      return_url,
    } = body as Record<string, unknown>;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return json({ error: "Amount must be at least 1 ZMW" }, 400);
    if (!phone || typeof phone !== "string") return json({ error: "Phone number required" }, 400);
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: rl, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_key: `elicate_charge:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rlErr) return json({ error: "Rate limit check failed", detail: rlErr.message }, 500);
    if (rl === false) return json({ error: "Too many top-up attempts. Try again in a minute." }, 429);

    const { data: wallet } = await userClient
      .from("wallets")
      .select("id,user_id,currency_code")
      .eq("id", target_wallet_id)
      .maybeSingle();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Invalid wallet" }, 403);
    if (wallet.currency_code !== "ZMW") {
      return json({ error: "Mobile money top-up is only available for ZMW wallets" }, 400);
    }

    const elicate = getElicateConfig();
    if (!elicate.secretKey) {
      return json({ error: `ELICATE_${elicate.mode === "live" ? "LIVE_" : ""}SECRET_KEY not configured` }, 500);
    }

    const networkResolved = resolveNetwork(typeof network === "string" ? network : null);
    const phoneNormalized = normalizeZmPhone(phone);
    const amountRounded = Math.round(amt * 100) / 100;
    const reference = `efin_topup_${userId.slice(0, 8)}_${Date.now()}`;
    const beneficiaryName = String(customer_name || userData?.user?.email || "Customer").trim();

    const { data: charge, error: insErr } = await admin
      .from("elicate_charges")
      .insert({
        user_id: userId,
        reference,
        amount_minor: Math.round(amountRounded * 100),
        currency: "ZMW",
        target_wallet_id,
        phone: phoneNormalized,
        network: networkResolved,
        customer_name: beneficiaryName,
        raw_request: {
          amount: amountRounded,
          currency: "ZMW",
          phone: phoneNormalized,
          network: networkResolved,
          reference,
          customer_name: beneficiaryName,
        },
      })
      .select()
      .single();

    if (insErr) return json({ error: "Could not record charge", detail: insErr.message }, 500);

    let redirectTarget: string | undefined;
    if (typeof return_url === "string" && return_url.trim()) {
      redirectTarget = return_url.trim();
      try {
        const u = new URL(redirectTarget);
        u.searchParams.set("elicate_charge_id", charge.id);
        redirectTarget = u.toString();
      } catch { /* leave as-is */ }
    }

    const result = await elicateCharge({
      amount: amountRounded,
      phone: phoneNormalized,
      network: networkResolved,
      currency: "ZMW",
      reference,
      customer_name: beneficiaryName,
      redirect_url: redirectTarget,
      return_url: redirectTarget,
    });

    if (!result.ok) {
      const friendlyError = result.status >= 500
        ? "Top-up provider is temporarily unavailable. Please try again in a moment."
        : (result.error || "Top-up failed");

      await admin.from("elicate_charges").update({
        status: "failed",
        failure_reason: friendlyError,
        raw_response: result.data,
      }).eq("id", charge.id);

      return json({
        error: friendlyError,
        code: result.status >= 500 ? "provider_internal_error" : "provider_error",
        provider_status: result.status,
        provider_response: result.data,
        mode: elicate.mode,
      }, 502);
    }

    const data = result.data;
    const transactionId = extractTransactionId(data);
    const providerReference = transactionId || String(data.reference ?? reference);
    const redirectUrl = extractRedirectUrl(data);

    await admin.from("elicate_charges").update({
      status: "awaiting_approval",
      psp_reference: providerReference,
      redirect_url: redirectUrl,
      raw_response: data,
    }).eq("id", charge.id);

    return json({
      success: true,
      charge_id: charge.id,
      transaction_id: transactionId,
      provider_reference: providerReference,
      redirect_url: redirectUrl,
      status: "awaiting_approval",
      mode: elicate.mode,
      message: redirectUrl
        ? "Complete verification on the secure payment page."
        : "Approve the prompt on your phone to complete the top-up.",
    });
  } catch (e) {
    console.error("elicate-charge error", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
