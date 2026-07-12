import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isNombaNigeriaConfigured, nombaTransferConversion } from "../_shared/nomba-nigeria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const internalSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isInternal = internalSecret && req.headers.get("x-internal-secret") === internalSecret;

    if (!isInternal) {
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
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const fromCurrency = String(body?.from_currency || body?.fromCurrency || "").toUpperCase();
    const toCurrency = String(body?.to_currency || body?.toCurrency || "NGN").toUpperCase();

    if (!amount || amount <= 0 || !fromCurrency || !toCurrency) {
      return new Response(JSON.stringify({ error: "amount, from_currency, to_currency required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isNombaNigeriaConfigured()) {
      return new Response(JSON.stringify({ error: "Nomba Nigeria not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await nombaTransferConversion(amount, fromCurrency, toCurrency);
    if (!result.ok || !result.convertedAmount) {
      return new Response(JSON.stringify({
        success: false,
        error: result.message || "Conversion failed",
        code: result.code,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      amount,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      converted_amount: result.convertedAmount,
      source: "nomba",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
