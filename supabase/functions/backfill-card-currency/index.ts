import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COUNTRY_CCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD",
  IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  CH: "CHF", JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD",
  NG: "NGN", KE: "KES", UG: "UGX", TZ: "TZS", RW: "RWF",
  ZM: "ZMW", GH: "GHS", ZA: "ZAR", CI: "XOF", SN: "XOF",
  CM: "XAF", EG: "EGP", MA: "MAD", IN: "INR", BR: "BRL",
  MX: "MXN", AE: "AED", SA: "SAR", TR: "TRY",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    let body: { payment_method_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = admin.from("saved_payment_methods")
      .select("id, stripe_payment_method_id, currency_code, country_code")
      .eq("user_id", userId);
    if (body.payment_method_id) query = query.eq("stripe_payment_method_id", body.payment_method_id);
    else query = query.is("currency_code", null);

    const { data: rows, error: selErr } = await query;
    if (selErr) throw selErr;

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ updated: [], skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile fallback currency
    const { data: profile } = await admin
      .from("profiles").select("default_currency").eq("user_id", userId).maybeSingle();
    const profileCcy = (profile?.default_currency as string | undefined) || "USD";

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const updated: Array<{ id: string; currency_code: string; country_code: string | null }> = [];

    for (const row of rows) {
      try {
        const pm = await stripe.paymentMethods.retrieve(row.stripe_payment_method_id);
        const country = (pm.card?.country || null) as string | null;
        const ccy = (country && COUNTRY_CCY[country.toUpperCase()]) || profileCcy;
        const { error: upErr } = await admin
          .from("saved_payment_methods")
          .update({ country_code: country, currency_code: ccy })
          .eq("id", row.id);
        if (upErr) throw upErr;
        updated.push({ id: row.id, currency_code: ccy, country_code: country });
      } catch (e) {
        console.error("backfill row failed", row.id, e);
      }
    }

    return new Response(JSON.stringify({ updated, total: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-card-currency error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
