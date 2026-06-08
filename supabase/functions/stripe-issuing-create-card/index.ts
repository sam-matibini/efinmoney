import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateCardInput {
  nickname?: string;
  currency?: string;
  purpose?: "personal" | "business" | "single_use" | "subscription";
  funding_wallet_id?: string;
  card_type?: "virtual" | "physical";
  tap_to_pay?: boolean;
  controls?: {
    per_authorization_limit?: number;
    daily_limit?: number;
    weekly_limit?: number;
    monthly_limit?: number;
    allowed_categories?: string[];
    blocked_categories?: string[];
    allowed_countries?: string[];
    single_use?: boolean;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
    if (claimErr || !claimData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimData.claims.sub as string;

    // Rate limit
    const rl = await admin.rpc("check_rate_limit", {
      p_key: `issuing_create:${userId}`,
      p_max_requests: 5,
      p_window_seconds: 300,
    });
    if (rl.data === false) return json({ error: "Rate limit exceeded" }, 429);

    // Tier-3 gating
    const { data: tier } = await admin
      .from("user_risk_tiers")
      .select("current_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (!tier || tier.current_tier !== "tier_3") {
      return json({ error: "Card issuance requires Tier 3 (full ID + address verification)." }, 403);
    }

    const body: CreateCardInput = await req.json().catch(() => ({}));
    const currency = (body.currency || "CAD").toUpperCase();
    const purpose = body.purpose || "personal";
    const cardType = body.card_type || "virtual";

    // Profile for cardholder data
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, phone_number, street_address, city, state_province, postal_code, address_country, country_code")
      .eq("user_id", userId)
      .maybeSingle();

    const addressCountry = ((profile as any)?.address_country || (profile as any)?.country_code || "CA").toUpperCase().slice(0, 2);

    if (!profile?.full_name || !(profile as any).street_address || !profile.city || !profile.postal_code) {
      return json({
        error: "Missing profile data. Please complete your full name and billing address (street, city, postal code) in Profile Settings.",
      }, 400);
    }

    // Get or create cardholder row
    let { data: cardholder } = await admin
      .from("cardholders")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ error: "Stripe Issuing not configured (STRIPE_SECRET_KEY missing)." }, 500);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

    if (!cardholder) {
      let stripeCardholderId: string | null = null;
      try {
        const ch = await stripe.issuing.cardholders.create({
          type: "individual",
          name: profile.full_name,
          email: profile.email || claimData.claims.email,
          phone_number: profile.phone_number || undefined,
          billing: {
            address: {
              line1: (profile as any).street_address,
              city: profile.city,
              state: profile.state_province || "ON",
              postal_code: profile.postal_code,
              country: addressCountry,
            },
          },
        }, { idempotencyKey: `cardholder:${userId}` });
        stripeCardholderId = ch.id;
      } catch (e: any) {
        console.error("Stripe Issuing cardholder create failed:", e?.message);
        return json({ error: `Stripe Issuing cardholder error: ${e?.message || "unknown"}` }, 400);
      }
      const { data: newCh, error: chErr } = await admin
        .from("cardholders")
        .insert({
          user_id: userId,
          stripe_cardholder_id: stripeCardholderId,
          type: "individual",
          legal_name: profile.full_name,
          email: profile.email || claimData.claims.email,
          phone: profile.phone_number,
          billing_line1: (profile as any).street_address,
          billing_city: profile.city,
          billing_state: profile.state_province || "ON",
          billing_postal_code: profile.postal_code,
          billing_country: addressCountry,
          kyc_verified_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (chErr) throw chErr;
      cardholder = newCh;
    }

    // Stripe spending controls
    const stripeControls: any = {};
    if (body.controls?.per_authorization_limit || body.controls?.daily_limit || body.controls?.monthly_limit) {
      const limits: any[] = [];
      if (body.controls.per_authorization_limit) {
        limits.push({ amount: Math.round(body.controls.per_authorization_limit * 100), interval: "per_authorization" });
      }
      if (body.controls.daily_limit) {
        limits.push({ amount: Math.round(body.controls.daily_limit * 100), interval: "daily" });
      }
      if (body.controls.weekly_limit) {
        limits.push({ amount: Math.round(body.controls.weekly_limit * 100), interval: "weekly" });
      }
      if (body.controls.monthly_limit) {
        limits.push({ amount: Math.round(body.controls.monthly_limit * 100), interval: "monthly" });
      }
      stripeControls.spending_limits = limits;
    }
    if (body.controls?.allowed_categories?.length) stripeControls.allowed_categories = body.controls.allowed_categories;
    if (body.controls?.blocked_categories?.length) stripeControls.blocked_categories = body.controls.blocked_categories;

    let stripeCardId: string | null = null;
    let last4: string | null = null;
    let expMonth: number | null = null;
    let expYear: number | null = null;

    const tapToPay = body.tap_to_pay !== false; // default ON

    if (!cardholder.stripe_cardholder_id) {
      return json({ error: "Cardholder is not linked to Stripe." }, 500);
    }
    try {
      const card = await stripe.issuing.cards.create({
        cardholder: cardholder.stripe_cardholder_id,
        currency: currency.toLowerCase(),
        type: cardType,
        status: "active",
        spending_controls: Object.keys(stripeControls).length ? stripeControls : undefined,
        metadata: { tap_to_pay: tapToPay ? "true" : "false" },
      });
      stripeCardId = card.id;
      last4 = card.last4;
      expMonth = card.exp_month;
      expYear = card.exp_year;
    } catch (e: any) {
      console.error("Stripe Issuing card create failed:", e?.message);
      const msg = e?.message || "Stripe Issuing card create failed";
      const code = e?.raw?.code || e?.code;
      const friendly = code === "balance_insufficient"
        ? "Your Stripe Issuing balance is insufficient. Top up the Issuing balance in your Stripe Dashboard, then retry."
        : msg;
      return json({ error: friendly, stripe_code: code }, 400);
    }

    const { data: card, error: cardErr } = await admin
      .from("issued_cards")
      .insert({
        user_id: userId,
        cardholder_id: cardholder.id,
        stripe_card_id: stripeCardId,
        last4,
        brand: "visa",
        currency,
        card_type: cardType,
        purpose,
        status: "active",
        nickname: body.nickname || null,
        funding_wallet_id: body.funding_wallet_id || null,
        exp_month: expMonth,
        exp_year: expYear,
        metadata: { sandbox: false, tap_to_pay: tapToPay },
      })
      .select()
      .single();
    if (cardErr) throw cardErr;

    // Insert controls row
    await admin.from("card_spending_controls").insert({
      card_id: card.id,
      per_authorization_limit: body.controls?.per_authorization_limit ?? null,
      daily_limit: body.controls?.daily_limit ?? null,
      weekly_limit: body.controls?.weekly_limit ?? null,
      monthly_limit: body.controls?.monthly_limit ?? null,
      allowed_categories: body.controls?.allowed_categories ?? null,
      blocked_categories: body.controls?.blocked_categories ?? null,
      allowed_countries: body.controls?.allowed_countries ?? null,
      single_use: body.controls?.single_use ?? (purpose === "single_use"),
    });

    return json({ card, sandbox: false });
  } catch (e: any) {
    console.error("create-card error:", e);
    return json({ error: e?.message || "Failed to create card" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
