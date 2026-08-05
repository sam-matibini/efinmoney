import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Deletes admin-onboarded accounts that have not signed in within 14 days.
 * Logs every deletion to audit_logs before delete.
 *
 * This function is intended to be invoked by Supabase scheduled functions
 * (or pg_cron) once per day. The caller is expected to be the service role
 * (no Authorization header required). It can also be invoked manually by a
 * super_admin for one-off cleanups.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Allow either: (a) service_role call with no auth, or
    //                (b) super_admin call with auth header.
    const authHeader = req.headers.get("Authorization");
    let isServiceRole = false;
    if (!authHeader) {
      // No auth header = service role context (scheduled invocation)
      isServiceRole = true;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: callerAdmin } = await admin
        .from("admin_users")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!callerAdmin || callerAdmin.role !== "super_admin") {
        return new Response(
          JSON.stringify({ error: "super_admin role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find orphans
    const { data: orphans, error: listErr } = await admin
      .from("admin_orphaned_invitations")
      .select("user_id, email, profile_id");
    if (listErr) {
      return new Response(
        JSON.stringify({ error: `List failed: ${listErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!orphans || orphans.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = orphans.map((o) => o.user_id);
    const deletedAt = new Date().toISOString();

    // Log to audit_logs first (so we have proof even if delete fails)
    for (const o of orphans) {
      await admin.from("audit_logs").insert({
        action: "developer_onboarding_orphan_cleanup",
        table_name: "auth.users",
        record_id: o.user_id,
        old_data: {
          email: o.email,
          profile_id: o.profile_id,
          reason: "no_sign_in_within_14_days",
        },
        new_data: null,
      });
    }

    // Delete auth users. The auth.admin.deleteUser cascade handles
    // profile + wallets + risk_tier + kyc_verifications + user_roles
    // (most of these are set to ON DELETE CASCADE in the schema).
    let deleted = 0;
    const failures: { user_id: string; error: string }[] = [];
    for (const userId of userIds) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        failures.push({ user_id: userId, error: delErr.message });
      } else {
        deleted += 1;
      }
    }

    return new Response(
      JSON.stringify({
        deleted,
        attempted: userIds.length,
        failures,
        cleaned_at: deletedAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
