import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
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

    const body = await req.json();
    const { card_id, action, controls, nickname } = body as {
      card_id: string;
      action?: "freeze" | "unfreeze" | "cancel" | "update_controls" | "rename";
      controls?: any;
      nickname?: string;
    };

    if (!card_id) return json({ error: "card_id required" }, 400);

    const { data: card, error: cardErr } = await admin
      .from("issued_cards")
      .select("*")
      .eq("id", card_id)
      .maybeSingle();
    if (cardErr || !card) return json({ error: "Card not found" }, 404);
    if (card.user_id !== userId) return json({ error: "Forbidden" }, 403);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = stripeKey && card.stripe_card_id ? new Stripe(stripeKey, { apiVersion: "2024-06-20" as any }) : null;

    if (action === "freeze" || action === "unfreeze" || action === "cancel") {
      const newStatus = action === "freeze" ? "frozen" : action === "unfreeze" ? "active" : "cancelled";
      const stripeStatus = action === "freeze" ? "inactive" : action === "unfreeze" ? "active" : "canceled";
      if (stripe && card.stripe_card_id) {
        try {
          await stripe.issuing.cards.update(card.stripe_card_id, { status: stripeStatus as any });
        } catch (e: any) {
          console.warn("Stripe card update failed:", e?.message);
        }
      }
      await admin.from("issued_cards").update({ status: newStatus }).eq("id", card_id);
      return json({ ok: true, status: newStatus });
    }

    if (action === "rename" && typeof nickname === "string") {
      await admin.from("issued_cards").update({ nickname: nickname.slice(0, 60) }).eq("id", card_id);
      return json({ ok: true });
    }

    if (action === "update_controls" && controls) {
      const stripeControls: any = {};
      const limits: any[] = [];
      if (controls.per_authorization_limit) limits.push({ amount: Math.round(controls.per_authorization_limit * 100), interval: "per_authorization" });
      if (controls.daily_limit) limits.push({ amount: Math.round(controls.daily_limit * 100), interval: "daily" });
      if (controls.weekly_limit) limits.push({ amount: Math.round(controls.weekly_limit * 100), interval: "weekly" });
      if (controls.monthly_limit) limits.push({ amount: Math.round(controls.monthly_limit * 100), interval: "monthly" });
      if (limits.length) stripeControls.spending_limits = limits;
      if (controls.allowed_categories?.length) stripeControls.allowed_categories = controls.allowed_categories;
      if (controls.blocked_categories?.length) stripeControls.blocked_categories = controls.blocked_categories;

      if (stripe && card.stripe_card_id && Object.keys(stripeControls).length) {
        try {
          await stripe.issuing.cards.update(card.stripe_card_id, { spending_controls: stripeControls });
        } catch (e: any) {
          console.warn("Stripe controls update failed:", e?.message);
        }
      }

      await admin
        .from("card_spending_controls")
        .upsert({
          card_id,
          per_authorization_limit: controls.per_authorization_limit ?? null,
          daily_limit: controls.daily_limit ?? null,
          weekly_limit: controls.weekly_limit ?? null,
          monthly_limit: controls.monthly_limit ?? null,
          allowed_categories: controls.allowed_categories ?? null,
          blocked_categories: controls.blocked_categories ?? null,
          allowed_countries: controls.allowed_countries ?? null,
          single_use: !!controls.single_use,
        }, { onConflict: "card_id" });

      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("update-card error:", e);
    return json({ error: e?.message || "Failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
