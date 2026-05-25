// Fetch live inquiry status from Persona. Useful as a fallback when webhooks
// haven't been delivered yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userRes.user.id;

  const url = new URL(req.url);
  let inquiryId = url.searchParams.get("inquiryId");
  if (!inquiryId && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    inquiryId = body?.inquiryId || null;
  }
  if (!inquiryId) return json({ error: "inquiryId required" }, 400);

  // Caller must own this inquiry (or be an admin).
  const { data: kyc } = await supabase
    .from("kyc_verifications")
    .select("id, user_id, verification_status, submitted_at")
    .eq("persona_inquiry_id", inquiryId)
    .maybeSingle();
  if (!kyc) return json({ error: "Inquiry not found" }, 404);
  if (kyc.user_id !== userId) {
    const { data: isAdmin } = await supabase.rpc("is_admin_user", { _uid: userId });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
  }

  const apiKey = Deno.env.get("PERSONA_API_KEY");
  if (!apiKey) return json({ error: "Persona not configured" }, 500);

  const res = await fetch(`https://api.withpersona.com/api/v1/inquiries/${inquiryId}?include=verifications`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Persona-Version": "2023-01-05",
      "Key-Inflection": "camel",
    },
  });
  const body = await res.json();
  if (!res.ok) return json({ error: "Persona API error", details: body }, 502);

  const liveStatus = body?.data?.attributes?.status ?? null;
  const liveDecision = body?.data?.attributes?.decision ?? null;

  // Inspect individual verifications: auto-approve once ID + Selfie/Liveness both pass.
  const included: any[] = Array.isArray(body?.included) ? body.included : [];
  let idPassed = false;
  let selfiePassed = false;
  for (const item of included) {
    const t: string = item?.type || "";
    const status: string = item?.attributes?.status || "";
    if (!t.startsWith("verification/")) continue;
    if (status !== "passed") continue;
    if (t.includes("government-id") || t.includes("document")) idPassed = true;
    if (t.includes("selfie") || t.includes("facial") || t.includes("liveness")) selfiePassed = true;
  }
  const coreChecksPassed = idPassed && selfiePassed;
  const isFinalStatus = kyc.verification_status === "approved" || kyc.verification_status === "rejected";

  if (isFinalStatus) {
    return json({
      inquiryId,
      status: liveStatus,
      decision: liveDecision,
      idPassed,
      selfiePassed,
      approved: kyc.verification_status === "approved",
      preservedStatus: kyc.verification_status,
      raw: body,
    });
  }

  const update: Record<string, unknown> = {
    persona_inquiry_status: liveStatus,
    persona_verification_data: body,
  };

  let auditAction: string | null = null;
  let approvedNow = false;

  if (liveStatus === "approved" || liveDecision === "approved" || coreChecksPassed) {
    update.persona_decision = "approved";
    update.verification_status = "approved";
    update.id_verification_status = "approved";
    update.liveness_check_status = "approved";
    update.reviewed_at = new Date().toISOString();
    if (!kyc.submitted_at) update.submitted_at = new Date().toISOString();
    auditAction = coreChecksPassed && liveStatus !== "approved" && liveDecision !== "approved"
      ? "persona_auto_approved_core_checks"
      : "persona_auto_approved";
    approvedNow = true;
  } else if (liveStatus === "needs_review") {
    update.persona_decision = "needs_review";
    update.verification_status = "pending_review";
    if (!kyc.submitted_at) update.submitted_at = new Date().toISOString();
  } else if (liveStatus === "declined" || liveDecision === "declined") {
    const reason = extractDeclineReason(body);
    update.persona_decision = "declined";
    update.persona_decision_reason = reason;
    update.verification_status = "rejected";
    update.id_verification_status = "rejected";
    update.id_rejection_reason = reason;
    auditAction = "persona_auto_rejected";
  } else if (liveStatus === "completed") {
    update.verification_status = "pending_review";
    if (!kyc.submitted_at) update.submitted_at = new Date().toISOString();
  } else if (liveStatus === "created" || liveStatus === "started") {
    update.verification_status = "in_progress";
  } else if (liveStatus === "failed" || liveStatus === "expired") {
    update.verification_status = "expired";
  }

  await admin.from("kyc_verifications").update(update).eq("id", kyc.id);

  if (auditAction && kyc.verification_status !== update.verification_status) {
    await admin.from("kyc_audit_log").insert({
      kyc_verification_id: kyc.id,
      admin_id: null,
      action: auditAction,
      previous_status: kyc.verification_status,
      new_status: String(update.verification_status),
      notes: coreChecksPassed ? "Auto-approved: ID + Selfie checks passed" : "Live Persona status sync",
    });
  }

  return json({
    inquiryId,
    status: liveStatus,
    decision: liveDecision,
    idPassed,
    selfiePassed,
    approved: approvedNow,
    raw: body,
  });
});

function extractDeclineReason(payload: any): string {
  const data = payload?.data?.attributes;
  if (typeof data?.declineReason === "string" && data.declineReason) return data.declineReason;
  const tags = data?.tags;
  if (Array.isArray(tags) && tags.length) return tags.join(", ");
  return "Declined by automated verification";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
