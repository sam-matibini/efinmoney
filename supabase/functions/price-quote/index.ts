import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { quotePrice } from "../_shared/pricingService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Authoritative customer price quote.
 * The UI must call this instead of computing fees client-side.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      direction = "payout",
      source_currency,
      dest_currency = null,
      dest_country = null,
      payment_method = null,
      customer_type = "consumer",
      amount,
      // Optional extra legs priced in the same call (e.g. card funding surcharge)
      legs = [],
    } = body ?? {};

    if (!source_currency || !Number.isFinite(Number(amount))) {
      return new Response(
        JSON.stringify({ error: "source_currency and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (direction !== "payin" && direction !== "payout") {
      return new Response(
        JSON.stringify({ error: "direction must be payin or payout" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth } = await anon.auth.getUser();
    if (!auth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const amt = Number(amount);
    const base = await quotePrice(supabase, {
      direction,
      sourceCurrency: source_currency,
      destCurrency: dest_currency,
      destCountry: dest_country,
      paymentMethod: payment_method,
      customerType: customer_type,
      amount: amt,
    });

    const legQuotes: Array<Record<string, unknown>> = [];
    if (Array.isArray(legs)) {
      for (const leg of legs.slice(0, 5)) {
        const q = await quotePrice(supabase, {
          direction: leg?.direction === "payin" ? "payin" : "payout",
          sourceCurrency: leg?.source_currency ?? source_currency,
          destCurrency: leg?.dest_currency ?? dest_currency,
          destCountry: leg?.dest_country ?? dest_country,
          paymentMethod: leg?.payment_method ?? null,
          customerType: customer_type,
          amount: Number(leg?.amount ?? amt),
        });
        legQuotes.push({ label: leg?.label ?? leg?.payment_method ?? "leg", ...q });
      }
    }

    const totalFee = Math.round(
      (base.fee + legQuotes.reduce((s, l) => s + Number(l.fee ?? 0), 0)) * 100,
    ) / 100;

    return new Response(
      JSON.stringify({
        success: true,
        fee: base.fee,
        fx_margin_bps: base.fxMarginBps,
        fx_revenue: base.fxRevenue,
        total_fee: totalFee,
        pricing_missing: base.pricingMissing,
        pricing_id: base.pricingId,
        legs: legQuotes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("price-quote error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
