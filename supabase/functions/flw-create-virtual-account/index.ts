// V4 Virtual account creation — POST /virtual-accounts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: cErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (cErr || !claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const currency = (body?.currency || "NGN").toString().toUpperCase();
    const isPermanent = body?.isPermanent !== false;

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_va:${userId}`, p_max_requests: 5, p_window_seconds: 60 });
    if (rl === false) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("email, first_name, last_name, phone, kyc_status").eq("user_id", userId).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!["approved", "verified"].includes(String(profile.kyc_status))) {
      return new Response(JSON.stringify({ error: "KYC must be approved before creating a virtual account" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let { data: wallet } = await admin.from("wallets").select("id").eq("user_id", userId).eq("currency_code", currency).maybeSingle();
    if (!wallet) {
      const { data: newW, error: wErr } = await admin.from("wallets").insert({ user_id: userId, currency_code: currency, is_default: false }).select("id").single();
      if (wErr) throw wErr;
      wallet = newW;
    }

    const { data: existing } = await admin.from("virtual_accounts").select("*").eq("user_id", userId).eq("currency_code", currency).eq("status", "active").maybeSingle();
    if (existing) return new Response(JSON.stringify({ virtual_account: existing }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const reference = `efm_va_${userId.slice(0, 8)}_${Date.now()}`;
    const flwBody = {
      currency,
      reference,
      is_permanent: isPermanent,
      customer: {
        email: profile.email,
        first_name: profile.first_name || "eFin",
        last_name: profile.last_name || "User",
        phone_number: profile.phone || "",
      },
      narration: `eFin Money - ${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
    };

    const { ok, json } = await flwFetch("/virtual-accounts", { method: "POST", body: JSON.stringify(flwBody), idempotencyKey: reference });
    if (!ok || !isFlwSuccess(json)) {
      console.error("FLW V4 VA create failed", json);
      return new Response(JSON.stringify({ error: json?.message || "Failed to create virtual account" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = json.data;
    const { data: inserted, error: insErr } = await admin.from("virtual_accounts").insert({
      user_id: userId,
      wallet_id: wallet!.id,
      currency_code: currency,
      account_number: d.account_number,
      bank_name: d.bank_name,
      account_name: d.account_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email,
      flw_order_ref: d.id || d.reference || reference,
      flw_response: d,
      is_permanent: isPermanent,
      expires_at: d.expires_at || d.expiry_date || null,
      status: "active",
    }).select("*").single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ virtual_account: inserted }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-create-virtual-account V4 error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
