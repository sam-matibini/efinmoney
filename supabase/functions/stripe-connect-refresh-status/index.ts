// Refresh a user's Stripe connected account status from Stripe and sync it to DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: row } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row) return json({ exists: false });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    // Try v2 first (matches create-account)
    let acct: any = null;
    let usedV2 = false;
    const r2 = await fetch(`https://api.stripe.com/v2/core/accounts/${row.stripe_account_id}?include=configuration.recipient,configuration.merchant,identity,requirements,defaults,configuration.customer`, {
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": "2025-03-31.preview",
      },
    });
    if (r2.ok) {
      acct = await r2.json();
      usedV2 = true;
    } else {
      // Fallback to v1
      const r1 = await fetch(`https://api.stripe.com/v1/accounts/${row.stripe_account_id}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      acct = await r1.json();
      if (!r1.ok) {
        console.error("Stripe account retrieve failed", acct);
        return json({ error: acct?.error?.message || "Stripe retrieve failed" }, r1.status);
      }
    }

    // Derive readiness
    let isActive = false;
    let statusMessage: string | null = null;
    let pendingItems: string[] = [];
    const statusOf = (c: any) => (typeof c === "string" ? c : c?.status);
    const humanize = (value: string) => value.replace(/[._]+/g, " ").replace(/_/g, " ").trim();
    if (usedV2) {
      const recipCaps = acct?.configuration?.recipient?.capabilities ?? {};
      const payouts = recipCaps?.payouts;
      const transfers = recipCaps?.transfers;
      const stripeBalanceTransfers = recipCaps?.stripe_balance?.stripe_transfers;
      isActive =
        statusOf(payouts) === "active" ||
        statusOf(transfers) === "active" ||
        statusOf(stripeBalanceTransfers) === "active";
    } else {
      const caps = acct?.capabilities ?? {};
      isActive =
        caps.transfers === "active" ||
        acct?.payouts_enabled === true ||
        acct?.charges_enabled === true;
    }

    const newStatus = isActive ? "active" : "pending";
    const capabilities = usedV2 ? (acct.configuration ?? {}) : (acct.capabilities ?? {});
    const requirements = acct.requirements ?? {};
    pendingItems = Array.from(new Set([
      ...(requirements?.currently_due || []),
      ...(requirements?.past_due || []),
      ...(requirements?.pending_verification || []),
    ].filter((item: unknown): item is string => typeof item === "string" && item.length > 0).map(humanize)));

    if (!isActive) {
      if (typeof requirements?.disabled_reason === "string" && requirements.disabled_reason.trim().length > 0) {
        statusMessage = `Stripe still blocks payouts: ${humanize(requirements.disabled_reason)}.`;
      } else if (pendingItems.length > 0) {
        statusMessage = `Stripe still needs: ${pendingItems.slice(0, 3).join(", ")}${pendingItems.length > 3 ? "…" : ""}.`;
      } else {
        statusMessage = "Stripe has not enabled payout transfers on this connected account yet.";
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from("stripe_connected_accounts")
      .update({
        status: newStatus,
        capabilities,
        requirements,
        raw: acct,
      })
      .eq("id", row.id)
      .select()
      .single();

    if (upErr) {
      console.error("DB update failed", upErr);
      return json({ error: upErr.message }, 500);
    }

    return json({ account: updated, is_active: isActive, message: statusMessage, pending_items: pendingItems, requirements });
  } catch (e) {
    console.error("refresh-status fatal", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
