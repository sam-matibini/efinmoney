import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifySumsubWebhook } from "../_shared/sumsub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const raw = await req.text();
  const sigHeader = req.headers.get("x-payload-digest") || req.headers.get("X-Payload-Digest") || "";
  const algHeader = req.headers.get("x-payload-digest-alg") || req.headers.get("X-Payload-Digest-Alg") || "HMAC_SHA256_HEX";
  const valid = await verifySumsubWebhook(raw, sigHeader, algHeader);

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* keep empty */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  await admin.from("sumsub_webhook_logs").insert({
    applicant_id: payload.applicantId ?? null,
    event_type: payload.type ?? null,
    payload,
    signature_valid: valid,
  });

  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const applicantId = payload.applicantId as string | undefined;
  if (applicantId) {
    const reviewResult = payload.reviewResult || {};
    const update: Record<string, unknown> = {
      review_status: payload.reviewStatus ?? null,
    };
    if (reviewResult.reviewAnswer) update.review_answer = reviewResult.reviewAnswer;
    if (reviewResult.reviewRejectType !== undefined) update.review_reject_type = reviewResult.reviewRejectType;
    if (reviewResult.moderationComment !== undefined) update.moderation_comment = reviewResult.moderationComment;
    if (reviewResult.clientComment !== undefined) update.client_comment = reviewResult.clientComment;
    if (reviewResult.rejectLabels) update.risk_labels = reviewResult.rejectLabels;

    const { data: existing } = await admin
      .from("sumsub_verifications")
      .select("id, user_id, raw_payload")
      .eq("applicant_id", applicantId)
      .maybeSingle();

    if (existing) {
      const merged = { ...(existing.raw_payload as object || {}), last_webhook: payload };
      await admin
        .from("sumsub_verifications")
        .update({ ...update, raw_payload: merged })
        .eq("applicant_id", applicantId);

      if (reviewResult.reviewAnswer === "RED") {
        await admin.from("admin_notifications").insert({
          title: "Sumsub: RED decision",
          message: `Applicant ${applicantId} returned RED (${reviewResult.reviewRejectType || "unknown"}).`,
          type: "kyc",
        }).then(() => {}, () => {});
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
