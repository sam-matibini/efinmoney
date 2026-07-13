import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Return existing
    const { data: existing } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) return json({ account: existing, reused: true });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const country = (body.country || "ca").toLowerCase();
    const displayName = body.display_name || user.user_metadata?.full_name || user.email || "eFinMoney user";
    const contactEmail = body.contact_email || user.email;
    const phone = body.phone || "0000000000";

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";

    // Stripe v2 Accounts API — JSON body
    // NOTE: Do NOT send identity.attestations.terms_of_service — for
    // dashboard:"full" accounts Stripe owns ToS collection and rejects
    // platform-on-behalf acceptance with `tos_acceptance_on_behalf_not_allowed`.
    // The account holder accepts ToS themselves during Stripe-hosted onboarding.
    const payload = {
      identity: {
        country,
        business_details: { phone },
      },

      dashboard: "full",
      defaults: {
        responsibilities: {
          losses_collector: "stripe",
          fees_collector: "stripe",
        },
      },
      display_name: displayName,
      contact_email: contactEmail,
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
        merchant: { capabilities: { card_payments: { requested: true } } },
        customer: { capabilities: { automatic_indirect_tax: { requested: true } } },
      },
      include: [
        "configuration.merchant",
        "configuration.recipient",
        "identity",
        "defaults",
        "configuration.customer",
      ],
    };

    const r = await fetch("https://api.stripe.com/v2/core/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/json",
        "Stripe-Version": "2025-03-31.preview",
      },
      body: JSON.stringify(payload),
    });
    const acct = await r.json();
    if (!r.ok) {
      console.error("Stripe v2 create account failed", acct);
      return json({ error: acct?.error?.message || "Stripe account create failed", details: acct }, r.status);
    }

    const { data: row, error: insErr } = await supabase
      .from("stripe_connected_accounts")
      .insert({
        user_id: user.id,
        stripe_account_id: acct.id,
        country,
        display_name: displayName,
        contact_email: contactEmail,
        dashboard: "full",
        status: "pending",
        capabilities: acct.configuration ?? {},
        requirements: acct.requirements ?? {},
        raw: acct,
      })
      .select()
      .single();
    if (insErr) {
      console.error("DB insert failed", insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({ account: row });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
