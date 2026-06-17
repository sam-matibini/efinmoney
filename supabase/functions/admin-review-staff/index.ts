import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_ROLES = ["super_admin", "compliance_officer", "finance_officer", "support_agent", "viewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await admin
      .from("admin_users")
      .select("id, role, status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!caller || caller.status !== "active" || caller.role !== "super_admin") {
      return json(403, { error: "Only an active super admin can review staff" });
    }

    const body = await req.json().catch(() => ({}));
    const staffId = body?.staff_id;
    const action = body?.action;
    if (!staffId || !["approve", "reject", "suspend", "reactivate", "change_role"].includes(action)) {
      return json(400, { error: "Invalid request" });
    }
    if (staffId === caller.id && action !== "change_role") {
      return json(400, { error: "You cannot change your own account status" });
    }

    const { data: target } = await admin
      .from("admin_users")
      .select("id, status, role")
      .eq("id", staffId)
      .maybeSingle();
    if (!target) return json(404, { error: "Staff member not found" });

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {};
    const details: Record<string, unknown> = {};

    switch (action) {
      case "approve":
        update.status = "active";
        update.document_status = "approved";
        update.reviewed_by = caller.id;
        update.reviewed_at = now;
        update.rejection_reason = null;
        break;
      case "reject":
        update.status = "rejected";
        update.document_status = "rejected";
        update.reviewed_by = caller.id;
        update.reviewed_at = now;
        update.rejection_reason = (body?.rejection_reason || "").trim() || "Not specified";
        details.rejection_reason = update.rejection_reason;
        break;
      case "suspend":
        update.status = "suspended";
        break;
      case "reactivate":
        update.status = "active";
        break;
      case "change_role":
        if (!ALLOWED_ROLES.includes(body?.role)) return json(400, { error: "Invalid role" });
        update.role = body.role;
        details.from_role = target.role;
        details.to_role = body.role;
        break;
    }

    const { error: upErr } = await admin.from("admin_users").update(update).eq("id", staffId);
    if (upErr) return json(500, { error: upErr.message });

    await admin.from("staff_audit_log").insert({
      actor_id: caller.id,
      target_admin_id: staffId,
      action,
      details,
    });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
