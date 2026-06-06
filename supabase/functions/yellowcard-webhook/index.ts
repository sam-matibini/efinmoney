// Yellow Card webhook receiver. Maps payment status to transfer status.
// Public URL: https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/yellowcard-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yc-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = await req.text();
    let event: any = {};
    try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400, headers: corsHeaders }); }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await admin.from("webhook_events").insert({
      provider: "yellowcard",
      event_type: event?.event ?? event?.type ?? "unknown",
      payload: event,
    }).then(() => {}, () => {});

    const ycPaymentId = event?.data?.id ?? event?.data?.paymentId ?? event?.paymentId;
    const sequenceId = event?.data?.sequenceId ?? event?.sequenceId;
    const status = (event?.data?.status ?? event?.status ?? "").toLowerCase();

    let newStatus: string | null = null;
    if (status === "complete" || status === "completed" || status === "success") newStatus = "success";
    else if (status === "failed" || status === "cancelled" || status === "expired") newStatus = "failed";
    else if (status === "processing" || status === "pending") newStatus = "payout_sent";

    if (newStatus) {
      const filter = sequenceId ? { id: sequenceId } : { yellowcard_payment_id: ycPaymentId };
      const q = admin.from("crossmint_yellowcard_transfers").update({
        status: newStatus,
        yellowcard_raw: event,
      });
      const target = sequenceId
        ? q.eq("id", sequenceId)
        : q.eq("yellowcard_payment_id", ycPaymentId);
      await target.then(() => {}, () => {});
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("yellowcard-webhook error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
