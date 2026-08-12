import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flovideAccountInquiry, flovideConfigured } from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accountNumber = "";
    let bankCode = "";
    let currency = "NGN";
    if (req.method === "GET") {
      const url = new URL(req.url);
      accountNumber = String(url.searchParams.get("accountNumber") || url.searchParams.get("account_number") || "").trim();
      bankCode = String(url.searchParams.get("bankCode") || url.searchParams.get("bank_code") || "").trim();
      currency = String(url.searchParams.get("currency") || "NGN").trim().toUpperCase();
    } else {
      const body = await req.json().catch(() => ({}));
      accountNumber = String(body?.accountNumber || body?.account_number || "").trim();
      bankCode = String(body?.bankCode || body?.bank_code || "").trim();
      currency = String(body?.currency || "NGN").trim().toUpperCase();
    }

    if (!accountNumber || !bankCode) {
      return new Response(JSON.stringify({ error: "accountNumber and bankCode required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `flovide_resolve:${user.id}`,
      p_max_requests: 30,
      p_window_seconds: 60,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!flovideConfigured()) {
      return new Response(JSON.stringify({
        resolved: false,
        error: "Flovide is not configured",
        source: "flovide",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await flovideAccountInquiry({
      currency,
      bank_code: bankCode,
      account_number: accountNumber,
    });

    const data = (result.json?.data && typeof result.json.data === "object")
      ? result.json.data as Record<string, unknown>
      : result.json as Record<string, unknown>;

    const accountName = String(
      data?.account_name
      || data?.accountName
      || data?.account_holder
      || data?.accountHolder
      || data?.name
      || "",
    ).trim();

    if (result.ok && accountName) {
      return new Response(JSON.stringify({
        resolved: true,
        account_name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
        source: "flovide",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      resolved: false,
      account_number: accountNumber,
      bank_code: bankCode,
      currency,
      error: String(result.json?.message || "Account lookup failed"),
      source: "flovide",
      provider: result.json,
    }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      resolved: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
