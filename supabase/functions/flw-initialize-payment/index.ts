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
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return jr(401, { error: "Unauthorized" });
    const userId = claims.claims.sub as string;

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
