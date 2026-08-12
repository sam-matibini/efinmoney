import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchNombaAccountLookup, isNombaNigeriaConfigured } from "../_shared/nomba-nigeria.ts";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accountNumber = "";
    let bankCode = "";
    if (req.method === "GET") {
      const url = new URL(req.url);
      accountNumber = String(url.searchParams.get("accountNumber") || url.searchParams.get("account_number") || "").trim();
      bankCode = String(url.searchParams.get("bankCode") || url.searchParams.get("bankcode") || "").trim();
    } else {
      const body = await req.json().catch(() => ({}));
      accountNumber = String(body?.accountNumber || body?.account_number || "").trim();
      bankCode = String(body?.bankCode || body?.bankcode || "").trim();
    }

    if (!accountNumber || !bankCode) {
      return new Response(JSON.stringify({ error: "accountNumber and bankCode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `nomba_resolve:${user.id}`,
      p_max_requests: 30,
      p_window_seconds: 60,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Nomba
    if (isNombaNigeriaConfigured()) {
      const { accountName, result } = await fetchNombaAccountLookup(accountNumber, bankCode);
      if (accountName) {
        return new Response(JSON.stringify({
          resolved: true,
          account_name: accountName,
          account_number: accountNumber,
          source: "nomba",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 2) Flutterwave fallback when Nomba cannot name-match
      try {
        const { ok, json } = await flwV3Fetch("/accounts/resolve", {
          method: "POST",
          body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
          timeoutMs: 10_000,
        });
        const flwName = ok ? String(json?.data?.account_name || "").trim() : "";
        if (flwName) {
          return new Response(JSON.stringify({
            resolved: true,
            account_name: flwName,
            account_number: accountNumber,
            source: "flutterwave",
            nomba_error: result.message || null,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch {
        /* ignore FLW errors — soft-fail below */
      }

      // Soft fail (200) so the client can keep trying other rails / continue unverified
      return new Response(JSON.stringify({
        resolved: false,
        unverified: true,
        account_number: accountNumber,
        error: result.message || "Account lookup failed",
        code: result.code,
        source: "nomba",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      resolved: false,
      unverified: true,
      error: "Nomba Nigeria not configured (NOMBA_PAY_API_URL / NOMBA_PAY_USER)",
      source: "nomba",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
