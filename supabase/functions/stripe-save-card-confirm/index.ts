import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const setupIntentId = String(body?.setup_intent_id ?? "");
    if (!setupIntentId.startsWith("seti_")) return json({ error: "Invalid setup_intent_id" }, 400);

    const intent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

    if (intent.metadata?.user_id !== userId) return json({ error: "Unauthorized" }, 403);
    if (intent.status !== "succeeded") return json({ error: `SetupIntent status: ${intent.status}` }, 400);

    const pm = intent.payment_method as Stripe.PaymentMethod;
    if (!pm || typeof pm === "string" || pm.type !== "card" || !pm.card) {
      return json({ error: "No card on payment method" }, 400);
    }
    const customerId = (typeof intent.customer === "string" ? intent.customer : intent.customer?.id) ?? "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Default = true if user has no other cards
    const { count } = await admin
      .from("saved_payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const isDefault = (count ?? 0) === 0;

    // Derive billing currency from card.country → fallback to profile default_currency → USD
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
    let currencyCode: string | null = pm.card.country ? (COUNTRY_CCY[pm.card.country.toUpperCase()] ?? null) : null;
    if (!currencyCode) {
      const { data: prof } = await admin
        .from("profiles")
        .select("default_currency, country_code")
        .eq("user_id", userId)
        .maybeSingle();
      currencyCode = (prof?.default_currency as string | null)
        || (prof?.country_code ? (COUNTRY_CCY[String(prof.country_code).toUpperCase()] ?? null) : null)
        || "USD";
    }

    const { data: row, error: insertErr } = await admin
      .from("saved_payment_methods")
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_payment_method_id: pm.id,
          card_brand: pm.card.brand,
          last_four: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          cardholder_name: pm.billing_details?.name ?? null,
          is_default: isDefault,
          currency_code: currencyCode,
        },
        { onConflict: "stripe_payment_method_id" },
      )
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ success: true, card: row });
  } catch (e) {
    console.error("stripe-save-card-confirm error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
