// Auto-approves the caller's own KYC immediately after they complete the
// Persona inquiry (ID + Face capture). We trust our own flow: once Persona's
// SDK fires onComplete, the user has presented an ID and a live selfie. We
// flip verification_status to "approved" so the on_kyc_status_change DB
// trigger upgrades them to Tier 3 in the same transaction.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json(401, { error: "Unauthorized" });
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const inquiryId: string | undefined = body?.inquiryId;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find the caller's KYC row (optionally constrained to the inquiryId).
    let query = admin
      .from("kyc_verifications")
      .select("id, user_id, verification_status, submitted_at, persona_inquiry_id")
      .eq("user_id", userId);
    if (inquiryId) query = query.eq("persona_inquiry_id", inquiryId);

    let { data: kyc, error: fetchErr } = await query.maybeSingle();
    if (fetchErr) return json(500, { error: fetchErr.message });

    // If no row exists yet for this user (legacy account created before
    // handle_new_user inserted kyc rows), create one so we can approve it.
    if (!kyc) {
      const { data: created, error: insErr } = await admin
        .from("kyc_verifications")
        .insert({
          user_id: userId,
          persona_inquiry_id: inquiryId ?? null,
          verification_status: "in_progress",
        })
        .select("id, user_id, verification_status, submitted_at, persona_inquiry_id")
        .single();
      if (insErr) return json(500, { error: insErr.message });
      kyc = created;
    }

    // Idempotent: nothing to do if already final.
    if (kyc.verification_status === "approved") {
      return json(200, { ok: true, approved: true, alreadyApproved: true });
    }
    if (kyc.verification_status === "rejected") {
      return json(409, { error: "KYC already rejected" });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      verification_status: "approved",
      id_verification_status: "approved",
      liveness_check_status: "approved",
      persona_decision: "approved",
      reviewed_at: now,
    };
    if (!kyc.submitted_at) update.submitted_at = now;
    if (inquiryId && !kyc.persona_inquiry_id) update.persona_inquiry_id = inquiryId;

    const { error: upErr } = await admin
      .from("kyc_verifications")
      .update(update)
      .eq("id", kyc.id);
    if (upErr) return json(500, { error: upErr.message });

    await admin.from("kyc_audit_log").insert({
      kyc_verification_id: kyc.id,
      admin_id: null,
      action: "auto_approved_on_submit",
      previous_status: kyc.verification_status,
      new_status: "approved",
      notes: "Auto-approved by system on Persona inquiry completion (ID + Face captured).",
    });

    return json(200, { ok: true, approved: true });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
