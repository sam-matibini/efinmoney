// Persona webhook receiver. Verifies HMAC signature when PERSONA_WEBHOOK_SECRET
// is configured, then updates kyc_verifications using service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let raw = "";
  let payload: any = null;
  let eventType: string | null = null;
  let inquiryId: string | null = null;

  try {
    raw = await req.text();
    const signatureHeader = req.headers.get("Persona-Signature") || req.headers.get("persona-signature");
    const secret = Deno.env.get("PERSONA_WEBHOOK_SECRET");

    if (secret && signatureHeader) {
      const ok = await verifySignature(secret, signatureHeader, raw);
      if (!ok) {
        await logEvent(supabase, { event_type: null, inquiry_id: null, payload: { rawSignatureFailure: true }, processed: false, error: "invalid signature" });
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (!secret) {
      console.warn("PERSONA_WEBHOOK_SECRET not configured — accepting webhook unverified");
    }

    payload = JSON.parse(raw);
    eventType = payload?.data?.attributes?.name || null;
    inquiryId =
      payload?.data?.attributes?.payload?.data?.id ||
      payload?.included?.find((i: any) => i.type === "inquiry")?.id ||
      null;

    const result = await processEvent(supabase, eventType, inquiryId, payload);
    await logEvent(supabase, { event_type: eventType, inquiry_id: inquiryId, payload, processed: true, error: null });
    return new Response(JSON.stringify({ received: true, processed: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("persona-webhook error", err);
    await logEvent(supabase, { event_type: eventType, inquiry_id: inquiryId, payload, processed: false, error: (err as Error).message });
    return new Response(JSON.stringify({ received: true, processed: false, error: (err as Error).message }), {
      status: 200, // 200 so Persona doesn't retry indefinitely on parse errors; logged for debugging
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processEvent(supabase: any, eventType: string | null, inquiryId: string | null, payload: any) {
  if (!eventType || !inquiryId) return { skipped: true, reason: "missing event type or inquiry id" };

  const referenceId =
    payload?.data?.attributes?.payload?.data?.attributes?.["reference-id"] ||
    payload?.data?.attributes?.payload?.data?.attributes?.referenceId ||
    null;

  // Look up the kyc_verification row
  let { data: kyc } = await supabase
    .from("kyc_verifications")
    .select("id, user_id, verification_status, submitted_at, persona_inquiry_id")
    .eq("persona_inquiry_id", inquiryId)
    .maybeSingle();

  if (!kyc && referenceId) {
    const byRef = await supabase
      .from("kyc_verifications")
      .select("id, user_id, verification_status, submitted_at, persona_inquiry_id")
      .eq("user_id", referenceId)
      .maybeSingle();
    kyc = byRef.data;
    if (kyc && !kyc.persona_inquiry_id) {
      await supabase
        .from("kyc_verifications")
        .update({ persona_inquiry_id: inquiryId })
        .eq("id", kyc.id);
      kyc.persona_inquiry_id = inquiryId;
    }
  }

  if (!kyc) return { skipped: true, reason: "no matching kyc_verification" };

  // Idempotency guard: once a verification is approved, NEVER let a later
  // webhook event downgrade it. Persona can send subsequent "declined" /
  // "marked-for-review" / "failed" events from re-decisioning or duplicate
  // inquiries — those must not flip an already-verified user to rejected.
  const isApproved = kyc.verification_status === "approved";
  const downgradeEvents = new Set([
    "inquiry.declined",
    "inquiry.marked-for-review",
    "inquiry.failed",
    "inquiry.expired",
  ]);
  if (isApproved && downgradeEvents.has(eventType)) {
    return { skipped: true, reason: `ignored ${eventType} on already-approved verification`, kycId: kyc.id };
  }

  const update: Record<string, any> = {};
  let auditAction: string | null = null;

  switch (eventType) {
    case "inquiry.created":
      update.persona_inquiry_status = "created";
      break;
    case "inquiry.started":
      update.persona_inquiry_status = "started";
      update.verification_status = "in_progress";
      break;
    case "inquiry.completed":
      // Auto-approve on completion: trust the SDK's onComplete + Persona's
      // synchronous "completed" event. The on_kyc_status_change trigger
      // promotes the user to Tier 3 / active in the same transaction.
      update.persona_inquiry_status = "completed";
      update.persona_verification_data = payload;
      update.verification_status = "approved";
      update.id_verification_status = "approved";
      update.liveness_check_status = "approved";
      update.persona_decision = "approved";
      update.reviewed_at = new Date().toISOString();
      if (!kyc.submitted_at) update.submitted_at = new Date().toISOString();
      auditAction = "persona_auto_approved_on_complete";
      break;
    case "inquiry.approved":
      update.persona_decision = "approved";
      update.persona_inquiry_status = "approved";
      update.persona_verification_data = payload;
      update.verification_status = "approved";
      update.reviewed_at = new Date().toISOString();
      update.id_verification_status = "approved";
      update.liveness_check_status = "approved";
      auditAction = "persona_auto_approved";
      break;
    case "inquiry.declined": {
      const reason = extractDeclineReason(payload);
      update.persona_decision = "declined";
      update.persona_inquiry_status = "declined";
      update.persona_decision_reason = reason;
      update.persona_verification_data = payload;
      update.id_verification_status = "rejected";
      update.id_rejection_reason = reason;
      update.verification_status = "rejected";
      auditAction = "persona_auto_rejected";
      break;
    }
    case "inquiry.failed":
      update.persona_inquiry_status = "failed";
      break;
    case "inquiry.expired":
      update.persona_inquiry_status = "expired";
      break;
    case "inquiry.marked-for-review":
      update.persona_decision = "needs_review";
      update.persona_inquiry_status = "needs_review";
      update.verification_status = "pending_review";
      auditAction = "persona_marked_for_review";
      break;
    default:
      return { skipped: true, reason: `unknown event ${eventType}` };
  }

  if (Object.keys(update).length > 0) {
    await supabase.from("kyc_verifications").update(update).eq("id", kyc.id);
  }
  if (auditAction) {
    await supabase.from("kyc_audit_log").insert({
      kyc_verification_id: kyc.id,
      admin_id: null,
      action: auditAction,
      previous_status: kyc.verification_status,
      new_status: update.verification_status || kyc.verification_status,
      notes: `Persona event: ${eventType}`,
    });
  }
  return { kycId: kyc.id, eventType };
}

function extractDeclineReason(payload: any): string {
  const tags = payload?.data?.attributes?.payload?.data?.attributes?.tags;
  if (Array.isArray(tags) && tags.length) return tags.join(", ");
  return payload?.data?.attributes?.payload?.data?.attributes?.declineReason || "Declined by automated verification";
}

async function logEvent(supabase: any, row: { event_type: string | null; inquiry_id: string | null; payload: any; processed: boolean; error: string | null }) {
  try {
    await supabase.from("persona_webhook_logs").insert(row);
  } catch (e) {
    console.error("Failed to log webhook event", e);
  }
}

async function verifySignature(secret: string, header: string, rawBody: string): Promise<boolean> {
  // Header format: "t=<timestamp>,v1=<hmac>" — Persona supports multiple v1 entries
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || sigs.length === 0) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
