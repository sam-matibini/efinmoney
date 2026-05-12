// V4 account resolution — POST /banks/account-resolve
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const accountNumber = String(body?.accountNumber || "").trim();
    const bankCode = String(body?.bankCode || "").trim();
    if (!accountNumber || !bankCode) return new Response(JSON.stringify({ error: "accountNumber and bankCode required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_resolve:${userId}`, p_max_requests: 30, p_window_seconds: 60 });
    if (rl === false) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { ok, json } = await flwFetch("/banks/account-resolve", {
      method: "POST",
      body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode }),
    });
    if (!ok || !isFlwSuccess(json)) return new Response(JSON.stringify({ resolved: false, error: json?.message || "Could not resolve account" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ resolved: true, account_name: json.data?.account_name, account_number: json.data?.account_number || accountNumber }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
