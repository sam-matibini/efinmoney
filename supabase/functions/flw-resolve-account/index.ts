// V3 account resolution — POST /v3/accounts/resolve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

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

    const { ok, json } = await flwV3Fetch("/accounts/resolve", {
      method: "POST",
      body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
      timeoutMs: 10_000,
    });
    const accountName = ok ? (json?.data?.account_name || null) : null;

    if (!accountName) {
      return new Response(JSON.stringify({ resolved: false, unverified: true, account_number: accountNumber, error: "Name verification temporarily unavailable. You can still continue — please double-check the account number." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ resolved: true, account_name: accountName, account_number: accountNumber }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
