// V3 Virtual account creation — POST /v3/virtual-account-numbers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function splitName(full: string | null | undefined) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || "eFin",
    last: parts.slice(1).join(" ") || "User",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: cErr } = await supabase.auth.getUser();
    if (cErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const currency = (body?.currency || "NGN").toString().toUpperCase();
    const isPermanent = body?.isPermanent !== false;
    const allowed = new Set(["NGN", "GHS"]);
    if (!allowed.has(currency)) {
      return new Response(JSON.stringify({ error: "Bank deposit accounts are available for NGN and GHS only" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_va:${userId}`, p_max_requests: 5, p_window_seconds: 60 });
    if (rl === false) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("email, full_name, phone_number, kyc_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr) {
      console.error("flw-create-virtual-account profile query", pErr);
      return new Response(JSON.stringify({ error: pErr.message || "Could not load profile" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
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

    const { first, last } = splitName(profile.full_name);
    const email = String(profile.email || user.email || "").trim();
    if (!email) {
      return new Response(JSON.stringify({ error: "Your profile needs an email before we can issue a bank account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reference = `efm_va_${userId.slice(0, 8)}_${Date.now()}`;
    const flwBody: Record<string, unknown> = {
      email,
      tx_ref: reference,
      is_permanent: isPermanent,
      currency,
      firstname: first,
      lastname: last,
      narration: `eFin Money - ${first} ${last}`.trim(),
      phonenumber: profile.phone_number || "",
    };

    const { ok, json } = await flwV3Fetch("/virtual-account-numbers", { method: "POST", body: JSON.stringify(flwBody), timeoutMs: 20_000 });
    if (!ok) {
      console.error("FLW V3 VA create failed", json);
      return new Response(JSON.stringify({ error: json?.message || "Failed to create virtual account" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = json.data;
    const { data: inserted, error: insErr } = await admin.from("virtual_accounts").insert({
      user_id: userId,
      wallet_id: wallet!.id,
      currency_code: currency,
      account_number: d.account_number,
      bank_name: d.bank_name,
      account_name: d.account_name || `${first} ${last}`.trim() || email,
      flw_order_ref: d.order_ref || d.flw_ref || reference,
      flw_response: d,
      is_permanent: isPermanent,
      expires_at: d.expiry_date || null,
      status: "active",
    }).select("*").single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ virtual_account: inserted }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-create-virtual-account V3 error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
