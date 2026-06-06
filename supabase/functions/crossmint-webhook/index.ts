// Crossmint webhook receiver
// Public URL: https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/crossmint-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crossmint-signature, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-crossmint-signature") ||
      req.headers.get("svix-signature") ||
      "";

    // TODO: verify signature with CROSSMINT_WEBHOOK_SECRET once provided
    const webhookSecret = Deno.env.get("CROSSMINT_WEBHOOK_SECRET");
    if (webhookSecret) {
      // signature verification will be implemented when secret is added
    }

    let event: any = {};
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Log every incoming event for debugging / audit
    await supabase.from("webhook_events").insert({
      provider: "crossmint",
      event_type: event?.type ?? "unknown",
      payload: event,
    }).then(
      () => {},
      () => {}, // ignore if table doesn't exist yet
    );

    const type: string = event?.type ?? "";
    const orderId: string | undefined =
      event?.data?.order?.orderId ??
      event?.data?.orderId ??
      event?.data?.id;

    if (orderId) {
      let newStatus: string | null = null;
      if (type.includes("payment.succeeded") || type.includes("order.payment.succeeded")) {
        newStatus = "card_charged";
      } else if (type.includes("delivery.completed") || type.includes("order.delivery.completed")) {
        newStatus = "usdc_received";
      } else if (type.includes("payment.failed") || type.includes("order.failed")) {
        newStatus = "failed";
      }

      if (newStatus) {
        await supabase
          .from("crossmint_yellowcard_transfers")
          .update({
            status: newStatus,
            crossmint_raw: event,
            updated_at: new Date().toISOString(),
          })
          .eq("crossmint_order_id", orderId)
          .then(() => {}, () => {});
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("crossmint-webhook error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
