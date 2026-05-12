// V4 Mobile Money / Bank-transfer / USSD direct charge OR hosted Card payment.
// For mobile money we POST /direct-charges with a phone number — user gets a USSD prompt.
// For card payments we create an orchestration link (hosted page) — avoids JWE encryption.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// (currency, network) -> Flutterwave V4 mobile_money network code
const NETWORK_MAP: Record<string, string> = {
  "KES:mpesa": "MPESA",
  "UGX:mtn": "MTN",
  "UGX:airtel": "AIRTEL",
  "GHS:mtn": "MTN",
  "GHS:airtel": "AIRTEL",
  "GHS:vodafone": "VODAFONE",
  "TZS:airtel": "AIRTEL",
  "TZS:vodafone": "VODAFONE",
  "TZS:tigo": "TIGO",
  "ZMW:mtn": "MTN",
  "ZMW:airtel": "AIRTEL",
  "ZMW:zamtel": "ZAMTEL",
  "RWF:mtn": "MTN",
  "RWF:airtel": "AIRTEL",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isGatewayJson(json: any, status: number): boolean {
  if ([0, 408, 502, 503, 504].includes(status)) return true;
  const raw = typeof json?.raw === "string" ? json.raw : "";
  return /OriginTimeout|Gateway Timeout|Service unavailable/i.test(raw);
}

// ── V3 fallback (api.flutterwave.com) — used when V4 host is gateway-timing-out
const V3_MM_TYPE: Record<string, string> = {
  KES: "mpesa",
  UGX: "mobile_money_uganda",
  GHS: "mobile_money_ghana",
  TZS: "mobile_money_tanzania",
  ZMW: "mobile_money_zambia",
  RWF: "mobile_money_rwanda",
};

async function v3MobileMoneyCharge(opts: {
  currency: string; amount: number; reference: string; redirectUrl: string;
  phone: string; network: string; email: string; name: string; userId: string;
}): Promise<{ ok: boolean; status: number; json: any }> {
  const secret = (Deno.env.get("FLW_SECRET_KEY") || "").trim();
  if (!secret) return { ok: false, status: 0, json: { message: "V3 fallback unavailable (FLW_SECRET_KEY not set)" } };
  const type = V3_MM_TYPE[opts.currency];
  if (!type) return { ok: false, status: 0, json: { message: `V3 has no MM type for ${opts.currency}` } };
  const body: Record<string, unknown> = {
    tx_ref: opts.reference,
    amount: String(opts.amount),
    currency: opts.currency,
    email: opts.email,
    fullname: opts.name || "eFin User",
    phone_number: opts.phone,
    redirect_url: opts.redirectUrl,
    meta: { user_id: opts.userId, type: "wallet_topup", currency: opts.currency, network: opts.network },
  };
  if (opts.currency === "GHS") body.network = (opts.network || "MTN").toUpperCase();
  if (opts.currency === "UGX") body.voucher = "00000";
  const res = await fetch(`https://api.flutterwave.com/v3/charges?type=${type}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  console.log("V3 MM charge response:", res.status, JSON.stringify(json));
  return { ok: res.ok && json?.status === "success", status: res.status, json };
}

async function v3HostedPayment(opts: {
  currency: string; amount: number; reference: string; redirectUrl: string;
  email: string; name: string; phone: string; paymentMethod: string; userId: string;
}): Promise<{ ok: boolean; status: number; json: any }> {
  const secret = (Deno.env.get("FLW_SECRET_KEY") || "").trim();
  if (!secret) return { ok: false, status: 0, json: { message: "V3 fallback unavailable (FLW_SECRET_KEY not set)" } };
  const payment_options = opts.paymentMethod === "card" ? "card"
    : opts.paymentMethod === "ussd" ? "ussd"
    : opts.paymentMethod === "banktransfer" ? "banktransfer"
    : "card,banktransfer,ussd";
  const body = {
    tx_ref: opts.reference,
    amount: String(opts.amount),
    currency: opts.currency,
    redirect_url: opts.redirectUrl,
    payment_options,
    customer: { email: opts.email, name: opts.name, phonenumber: opts.phone },
    meta: { user_id: opts.userId, type: "wallet_topup", currency: opts.currency },
    customizations: { title: "eFinMoney top-up" },
  };
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  console.log("V3 hosted payment response:", res.status, JSON.stringify(json));
  return { ok: res.ok && json?.status === "success", status: res.status, json };
}

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

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const currency = String(body?.currency || "NGN").toUpperCase();
    const paymentMethod = String(body?.paymentMethod || "card"); // card | mobilemoney | banktransfer | ussd
    const redirectUrl = String(body?.redirectUrl || "");
    const phone = String(body?.phone || "").trim();
    const network = String(body?.network || "").toLowerCase();
    const country = String(body?.country || "").toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) return jr(400, { error: "Invalid amount" });
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_topup:${userId}`, p_max_requests: 10, p_window_seconds: 60 });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("email, first_name, last_name, phone").eq("user_id", userId).maybeSingle();

    const reference = `efm_topup_${userId.slice(0, 8)}_${Date.now()}`;
    const customer = {
      email: profile?.email || `${userId}@efin.money`,
      name: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || (profile?.email ?? "eFin User"),
      phone_number: phone || profile?.phone || "",
    };

    // ── Mobile Money: V4 direct charge (no encryption needed) ───────────
    if (paymentMethod === "mobilemoney") {
      if (currency === "NGN") {
        return jr(400, { error: "Nigeria does not support mobile money on Flutterwave. Please use bank transfer, USSD, or card instead." });
      }
      if (!phone) return jr(400, { error: "Phone number required for mobile money" });
      const networkCode = NETWORK_MAP[`${currency}:${network}`];
      if (!networkCode) return jr(400, { error: `Unsupported mobile money network ${network} for ${currency}` });

      const payload = {
        currency,
        amount: String(amount),
        reference,
        redirect_url: redirectUrl,
        customer,
        payment_method: {
          type: "mobile_money",
          mobile_money: {
            country_code: country || currency.slice(0, 2),
            network: networkCode,
            phone_number: phone,
          },
        },
        meta: { user_id: userId, type: "wallet_topup", currency },
      };
      const { ok, json } = await flwFetch("/direct-charges", { method: "POST", body: JSON.stringify(payload) });
      if (!ok || !isFlwSuccess(json)) return jr(502, { error: json?.message || json?.error || "Mobile money charge failed", details: json });

      // V4 returns next_action: USSD code, OTP prompt, or a redirect
      const data = json.data || {};
      return new Response(JSON.stringify({
        success: true,
        charge_id: data.id,
        reference,
        next_action: data.next_action || data.processor_response || null,
        status: data.status,
        payment_link: data.next_action?.redirect_url || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Card / USSD / Bank-transfer: hosted orchestration link ──────────
    const orchestrationPayload = {
      currency,
      amount: String(amount),
      reference,
      redirect_url: redirectUrl,
      customer,
      payment_method_types: paymentMethod === "card" ? ["card"]
        : paymentMethod === "ussd" ? ["ussd"]
        : paymentMethod === "banktransfer" ? ["bank_transfer"]
        : ["card", "bank_transfer", "ussd"],
      meta: { user_id: userId, type: "wallet_topup", currency },
    };
    const { ok, json } = await flwFetch("/orchestration", { method: "POST", body: JSON.stringify(orchestrationPayload) });
    if (!ok || !isFlwSuccess(json)) return jr(502, { error: json?.message || json?.error || "Failed to initialize payment", details: json });

    return new Response(JSON.stringify({
      success: true,
      payment_link: json.data?.link || json.data?.checkout_url,
      reference,
      tx_ref: reference,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-initialize-payment V4 error", err);
    return jr(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
