/**
 * Apply a Plaid Identity Verification status onto kyc_verifications.
 * Mirrors persona-self-approve for success; pending_review / failed map accordingly.
 */
export async function applyPlaidIdvToKyc(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    userId: string;
    identityVerificationId: string;
    status: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<{ ok: true; verification_status: string } | { ok: false; error: string }> {
  const status = String(opts.status || "").toLowerCase();
  const now = new Date().toISOString();

  let { data: kyc, error: fetchErr } = await admin
    .from("kyc_verifications")
    .select("id, user_id, verification_status, submitted_at, plaid_identity_verification_id")
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  if (!kyc) {
    const { data: created, error: insErr } = await admin
      .from("kyc_verifications")
      .upsert(
        {
          user_id: opts.userId,
          plaid_identity_verification_id: opts.identityVerificationId,
          plaid_idv_status: status,
          plaid_idv_payload: opts.payload ?? null,
          verification_provider: "plaid",
          verification_status: "in_progress",
          current_step: "identity",
        },
        { onConflict: "user_id", ignoreDuplicates: false },
      )
      .select("id, user_id, verification_status, submitted_at, plaid_identity_verification_id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    kyc = created;
  }

  if (kyc.verification_status === "approved" && status === "success") {
    return { ok: true, verification_status: "approved" };
  }
  if (kyc.verification_status === "rejected" && (status === "failed" || status === "expired" || status === "canceled")) {
    return { ok: true, verification_status: "rejected" };
  }

  const update: Record<string, unknown> = {
    plaid_identity_verification_id: opts.identityVerificationId,
    plaid_idv_status: status,
    plaid_idv_payload: opts.payload ?? null,
    verification_provider: "plaid",
  };
  if (!kyc.submitted_at) update.submitted_at = now;

  let verification_status = kyc.verification_status as string;
  let auditAction: string | null = null;
  let notes = "";

  if (status === "success") {
    verification_status = "approved";
    update.verification_status = "approved";
    update.id_verification_status = "approved";
    update.liveness_check_status = "approved";
    update.reviewed_at = now;
    update.current_step = "completed";
    auditAction = "auto_approved_on_plaid_idv";
    notes = "Auto-approved on Plaid Identity Verification success.";
  } else if (status === "pending_review") {
    verification_status = "pending_review";
    update.verification_status = "pending_review";
    auditAction = "plaid_idv_pending_review";
    notes = "Plaid Identity Verification requires manual review.";
  } else if (status === "failed" || status === "expired" || status === "canceled") {
    verification_status = "rejected";
    update.verification_status = "rejected";
    update.id_verification_status = "rejected";
    update.id_rejection_reason = `Plaid IDV ${status}`;
    update.reviewed_at = now;
    auditAction = "plaid_idv_rejected";
    notes = `Plaid Identity Verification ended with status=${status}.`;
  } else {
    // active / other
    if (kyc.verification_status === "not_started") {
      update.verification_status = "in_progress";
      verification_status = "in_progress";
    }
  }

  const { error: upErr } = await admin.from("kyc_verifications").update(update).eq("id", kyc.id);
  if (upErr) return { ok: false, error: upErr.message };

  if (auditAction) {
    await admin.from("kyc_audit_log").insert({
      kyc_verification_id: kyc.id,
      admin_id: null,
      action: auditAction,
      previous_status: kyc.verification_status,
      new_status: verification_status,
      notes,
    });
  }

  return { ok: true, verification_status };
}
