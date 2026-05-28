import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    // Validate caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: adminRow } = await admin.from("admin_users").select("id, role").eq("id", userData.user.id).maybeSingle();
    if (!adminRow) return json(403, { error: "Not an administrator" });
    if (!["super_admin", "compliance_officer"].includes(adminRow.role)) {
      return json(403, { error: "Insufficient permissions to approve" });
    }

    const body = await req.json();
    const { verification_id, scope } = body || {};
    if (!verification_id || !["id_only", "id_and_address"].includes(scope)) {
      return json(400, { error: "Invalid request body" });
    }

    const { data: kyc } = await admin.from("kyc_verifications").select("*").eq("id", verification_id).maybeSingle();
    if (!kyc) return json(404, { error: "Verification not found" });

    const previous = kyc.verification_status;
    const isOverride = previous === "approved" || previous === "rejected" || body?.override === true;

    const update: Record<string, unknown> = {
      verification_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminRow.id,
      id_verification_status: "approved",
    };
    if (scope === "id_and_address") update.address_verification_status = "approved";

    const { error: upErr } = await admin.from("kyc_verifications").update(update).eq("id", verification_id);
    if (upErr) return json(500, { error: upErr.message });

    const noteParts: string[] = [
      scope === "id_and_address" ? "Approved ID + address (Tier 3)" : "Approved ID only (Tier 2)",
    ];
    if (isOverride) {
      noteParts.push(`OVERRIDE — previous: ${previous}`);
      if (kyc.persona_decision) noteParts.push(`Persona: ${kyc.persona_decision}`);
    }

    await admin.from("kyc_audit_log").insert({
      kyc_verification_id: verification_id,
      admin_id: adminRow.id,
      action: isOverride ? "approved_override" : "approved",
      previous_status: previous,
      new_status: "approved",
      notes: noteParts.join(" • "),
    });

    // Best-effort user notification (non-blocking)
    try {
      await admin.functions.invoke("notify-user", {
        body: { user_id: kyc.user_id, type: "kyc_approved", scope },
      });
    } catch { /* ignore */ }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
