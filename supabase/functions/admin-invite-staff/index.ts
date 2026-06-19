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

    // Validate caller is an active super_admin.
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
      return json(403, { error: "Only an active super admin can invite staff" });
    }

    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").trim().toLowerCase();
    const fullName = (body?.full_name || "").trim();
    const role = body?.role;
    const appUrl = Deno.env.get("APP_URL") || "https://efin.money";
    const redirectTo = body?.redirect_to || `${appUrl}/admin/onboarding`;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json(400, { error: "A valid email is required" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return json(400, { error: "Invalid role" });
    }
    if (!fullName) return json(400, { error: "Full name is required" });

    // Create (or invite) the auth user and send the invite email.
    let userId: string | null = null;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, is_staff: true },
    });

    if (inviteErr) {
      // Likely already registered — locate the existing user instead of failing.
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (!existing) return json(400, { error: inviteErr.message });
      userId = existing.id;
    } else {
      userId = invited?.user?.id ?? null;
    }

    if (!userId) return json(500, { error: "Could not resolve invited user" });

    // Upsert the staff record in invited state.
    const { error: upErr } = await admin.from("admin_users").upsert(
      {
        id: userId,
        role,
        full_name: fullName,
        email,
        status: "invited",
        document_status: "pending",
        invited_by: caller.id,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (upErr) return json(500, { error: upErr.message });

    await admin.from("staff_audit_log").insert({
      actor_id: caller.id,
      target_admin_id: userId,
      action: "invited",
      details: { email, role, full_name: fullName },
    });

    return json(200, { ok: true, staff_id: userId });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
