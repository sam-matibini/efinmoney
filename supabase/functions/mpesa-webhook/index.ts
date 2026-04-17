import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safaricom callback IP allowlist (production). In sandbox we accept any source.
const SAFARICOM_IPS = new Set<string>([
  "196.201.214.200", "196.201.214.206", "196.201.213.114",
  "196.201.214.207", "196.201.214.208", "196.201.213.44",
  "196.201.212.127", "196.201.212.128", "196.201.212.129",
  "196.201.212.132", "196.201.212.136", "196.201.212.138",
  "196.201.212.69", "196.201.212.74",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const callbackType = url.searchParams.get("type") || "result";
  const transferIdHint = url.searchParams.get("transfer_id");

  let payload: any = {};
  try { payload = await req.json(); } catch { payload = {}; }

  const env = (Deno.env.get("MPESA_ENVIRONMENT") || "sandbox") as "sandbox" | "production";
  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "";

  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });

  // Always log first
  const result = payload.Result || {};
  const conversationId = result.ConversationID || payload.ConversationID;
  const resultCode = result.ResultCode;
  const resultDesc = result.ResultDesc || payload.ResultDesc;

  // Locate transfer
  let transferId: string | null = transferIdHint;
  if (!transferId && conversationId) {
    const { data: t } = await supabase
      .from("transfers")
      .select("id, sender_id")
      .eq("provider_reference", conversationId)
      .maybeSingle();
    transferId = t?.id ?? null;
  }

  const { data: inboxRow } = await supabase.from("webhooks_inbox").insert({
    provider: "mpesa",
    event_type: callbackType,
    external_reference: conversationId ?? null,
    transfer_id: transferId,
    payload,
    headers: headersObj,
    status: "received",
  }).select().single();

  // Verify source in production
  if (env === "production" && sourceIp && !SAFARICOM_IPS.has(sourceIp)) {
    await supabase.from("webhooks_inbox").update({
      status: "rejected",
      processing_error: `Untrusted source IP: ${sourceIp}`,
      processed_at: new Date().toISOString(),
    }).eq("id", inboxRow!.id);

    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: "Rejected" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (transferId) {
      const { data: transfer } = await supabase
        .from("transfers")
        .select("sender_id, recipient_name, source_amount, source_currency")
        .eq("id", transferId)
        .single();

      const isTimeout = callbackType === "timeout";
      const isSuccess = !isTimeout && resultCode === 0;

      await supabase.from("transfers").update({
        status: isSuccess ? "completed" : "failed",
        completed_at: isSuccess ? new Date().toISOString() : null,
        failure_reason: isSuccess ? null : (resultDesc || (isTimeout ? "Timed out" : "Unknown error")),
      }).eq("id", transferId);

      if (transfer?.sender_id) {
        await supabase.from("notifications").insert({
          user_id: transfer.sender_id,
          title: isSuccess ? "M-Pesa transfer completed" : "M-Pesa transfer failed",
          message: isSuccess
            ? `Sent ${transfer.source_currency} ${transfer.source_amount} to ${transfer.recipient_name}.`
            : (resultDesc || "M-Pesa reported a failure."),
          type: isSuccess ? "success" : "error",
        });
      }
    }

    await supabase.from("webhooks_inbox").update({
      status: "processed", processed_at: new Date().toISOString(),
    }).eq("id", inboxRow!.id);

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("mpesa-webhook error:", msg);
    await supabase.from("webhooks_inbox").update({
      status: "error", processing_error: msg, processed_at: new Date().toISOString(),
    }).eq("id", inboxRow!.id);

    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
