import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await admin
      .from("admin_users")
      .select("id, role, status, full_name")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!caller || caller.status !== "active") return json(403, { error: "Forbidden" });
    if (!["super_admin", "finance_officer"].includes(caller.role)) {
      return json(403, { error: "Only finance officers and super admins can process payroll" });
    }

    const body = await req.json().catch(() => ({}));
    const { run_id, action } = body;

    if (!run_id) return json(400, { error: "run_id is required" });
    if (!["approve", "mark_paid"].includes(action)) {
      return json(400, { error: "action must be 'approve' or 'mark_paid'" });
    }

    const { data: run, error: runErr } = await admin
      .from("payroll_runs")
      .select("id, status, entry_count")
      .eq("id", run_id)
      .maybeSingle();

    if (runErr || !run) return json(404, { error: "Payroll run not found" });

    if (action === "approve") {
      if (run.status !== "draft") return json(400, { error: "Only draft runs can be approved" });
      const { error } = await admin
        .from("payroll_runs")
        .update({ status: "approved", approved_by: caller.id, approved_at: new Date().toISOString() })
        .eq("id", run_id);
      if (error) return json(500, { error: error.message });

      await admin.from("staff_audit_log").insert({
        actor_id: caller.id,
        target_admin_id: caller.id,
        action: "payroll_approved",
        details: { run_id, approved_by: caller.full_name },
      });

      return json(200, { ok: true, status: "approved" });
    }

    if (action === "mark_paid") {
      if (run.status !== "approved") return json(400, { error: "Only approved runs can be marked as paid" });

      const now = new Date().toISOString();

      const { error: entryErr } = await admin
        .from("payroll_entries")
        .update({ paid_at: now })
        .eq("run_id", run_id)
        .is("paid_at", null);
      if (entryErr) return json(500, { error: entryErr.message });

      const { error: runUpdateErr } = await admin
        .from("payroll_runs")
        .update({ status: "paid", paid_at: now })
        .eq("id", run_id);
      if (runUpdateErr) return json(500, { error: runUpdateErr.message });

      // Notify each staff member via admin_notifications
      const { data: entries } = await admin
        .from("payroll_entries")
        .select("staff_id, gross, net")
        .eq("run_id", run_id);

      if (entries && entries.length > 0) {
        const notifications = entries.map((e: { staff_id: string; gross: number; net: number }) => ({
          admin_id: e.staff_id,
          type: "payslip_ready",
          message: `Your payslip is ready. Net pay: ${e.net.toFixed(2)}.`,
          is_read: false,
        }));
        await admin.from("admin_notifications").insert(notifications).select();
      }

      await admin.from("staff_audit_log").insert({
        actor_id: caller.id,
        target_admin_id: caller.id,
        action: "payroll_paid",
        details: { run_id, paid_by: caller.full_name, entry_count: run.entry_count },
      });

      return json(200, { ok: true, status: "paid" });
    }
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
