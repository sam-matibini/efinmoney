import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flovideConfigured, flovideGetRates } from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    // Public-ish FX quote: allow anon key + optional user session
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
    // Soft auth — market rates are useful pre-login; still verify token shape via getUser when present
    await supabase.auth.getUser().catch(() => null);

    if (!flovideConfigured()) {
      return new Response(JSON.stringify({ error: "Flovide is not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const from = (url.searchParams.get("from") || url.searchParams.get("from_currency") || "").trim().toUpperCase();
    const to = (url.searchParams.get("to") || url.searchParams.get("to_currency") || "").trim().toUpperCase();
    const amountRaw = url.searchParams.get("amount");
    const amount = amountRaw != null ? Number(amountRaw) : undefined;

    if (!from || !to) {
      return new Response(JSON.stringify({ error: "from and to currencies required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await flovideGetRates(from, to, amount);
    const data = (result.json?.data && typeof result.json.data === "object")
      ? result.json.data as Record<string, unknown>
      : result.json as Record<string, unknown>;

    // Flovide live shape: data.rate.to_currency.amount / data.recipient.amount
    const rateObj = (data?.rate && typeof data.rate === "object")
      ? data.rate as Record<string, unknown>
      : null;
    const toCur = (rateObj?.to_currency && typeof rateObj.to_currency === "object")
      ? rateObj.to_currency as Record<string, unknown>
      : null;
    const recipient = (data?.recipient && typeof data.recipient === "object")
      ? data.recipient as Record<string, unknown>
      : null;

    const rate = Number(
      toCur?.amount
      ?? data?.rate
      ?? data?.exchange_rate
      ?? data?.mid_rate
      ?? data?.effective_rate
      ?? data?.fx_rate
      ?? 0,
    );
    const converted = Number(
      recipient?.amount
      ?? data?.converted_amount
      ?? data?.destination_amount
      ?? data?.to_amount
      ?? (Number.isFinite(amount) && rate > 0 ? amount! * rate : 0),
    );

    if (!result.ok || !(rate > 0)) {
      return new Response(JSON.stringify({
        success: false,
        from,
        to,
        error: String(result.json?.message || "Rate unavailable"),
        source: "flovide",
        provider: result.json,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      from,
      to,
      pair: `${from}:${to}`,
      mid_rate: String(rate),
      effective_rate: rate,
      amount: Number.isFinite(amount) ? amount : null,
      converted_amount: converted > 0 ? converted : null,
      source: "flovide",
      provider: data,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
