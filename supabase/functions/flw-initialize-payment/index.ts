// V3 hosted payment — POST /v3/payments. Always returns a hosted checkout link.
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
    const walletId = body?.walletId ? String(body.walletId) : "";
    const txType = String(body?.type || "wallet_topup");
    const clientTxRef = body?.tx_ref ? String(body.tx_ref) : "";

    // Validate the wallet (when provided) belongs to the caller and matches currency
    if (walletId) {
      const { data: w } = await supabase
        .from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", walletId)
        .maybeSingle();
      if (!w || w.user_id !== userId) return jr(403, { error: "Wallet not accessible" });
      if (w.currency_code.toUpperCase() !== currency) {
        return jr(400, { error: `Wallet currency (${w.currency_code}) does not match top-up currency (${currency})` });
      }
    }

    if (!Number.isFinite(amount) || amount <= 0) return jr(400, { error: "Invalid amount" });
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_topup:${userId}`, p_max_requests: 10, p_window_seconds: 60 });
    if (rl === false) return jr(429, { error: "Too many requests" });

    if (paymentMethod === "mobilemoney" && currency === "NGN") {
      return jr(400, { error: "Nigeria does not support mobile money on Flutterwave. Please use bank transfer, USSD, or card instead." });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("email, first_name, last_name, phone").eq("user_id", userId).maybeSingle();

    const reference = clientTxRef || `efm_topup_${userId.slice(0, 8)}_${Date.now()}`;
    const customerEmail = profile?.email || `${userId}@efin.money`;
    const customerName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || (profile?.email ?? "eFin User");
    const customerPhone = phone || profile?.phone || "";

    // Map paymentMethod -> V3 payment_options
    const payment_options =
      paymentMethod === "card" ? "card"
      : paymentMethod === "ussd" ? "ussd"
      : paymentMethod === "banktransfer" ? "banktransfer"
      : paymentMethod === "mobilemoney"
        ? (currency === "GHS" ? "mobilemoneyghana"
          : currency === "UGX" ? "mobilemoneyuganda"
          : currency === "KES" ? "mpesa"
          : currency === "TZS" ? "mobilemoneytanzania"
          : currency === "ZMW" ? "mobilemoneyzambia"
          : currency === "RWF" ? "mobilemoneyrwanda"
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
      return ok({ success: false, error: msg, transient: [0, 408, 502, 503, 504].includes(status), provider_status: status });
    }

    return ok({
      success: true,
      payment_link: json?.data?.link,
      reference,
      tx_ref: reference,
    });
  } catch (err) {
    console.error("flw-initialize-payment V3 error", err);
    return ok({ success: false, error: err instanceof Error ? err.message : "Unknown error", transient: true });
  }
});
