import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "finance", "compliance"]);
    const authorized = !!roles && roles.length > 0;
    if (!authorized) return json({ error: "Forbidden — requires admin, finance, or compliance role" }, 403);

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/incident-management\/?/, "");

    // GET /incident-management — list all incidents
    if (req.method === "GET" && !path) {
      const status = url.searchParams.get("status");
      const category = url.searchParams.get("category");
      let query = admin.from("incidents").select("*").order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ incidents: data });
    }

    // GET /incident-management/:id — single incident with timeline
    if (req.method === "GET" && path) {
      const incidentId = path;
      const { data: incident, error: incErr } = await admin.from("incidents").select("*").eq("id", incidentId).maybeSingle();
      if (incErr) return json({ error: incErr.message }, 500);
      if (!incident) return json({ error: "Not found" }, 404);

      const { data: timeline, error: tlErr } = await admin
        .from("incident_timeline")
        .select("*, profiles:user_id(full_name)")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true });
      if (tlErr) return json({ error: tlErr.message }, 500);

      return json({ incident, timeline });
    }

    // POST /incident-management — create incident
    if (req.method === "POST" && !path) {
      const body = await req.json();
      const { data, error } = await admin.from("incidents").insert({
        title: body.title,
        severity: body.severity || "medium",
        category: body.category,
        description: body.description || null,
        impact: body.impact || null,
        affected_systems: body.affected_systems || [],
        reported_by: userData.user.id,
        assigned_to: body.assigned_to || null,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ incident: data }, 201);
    }

    // PATCH /incident-management/:id — update incident (status, assignment, root_cause, etc.)
    if (req.method === "PATCH" && path) {
      const incidentId = path;
      const body = await req.json();

      const updates: Record<string, unknown> = {};
      if (body.status) updates.status = body.status;
      if (body.severity !== undefined) updates.severity = body.severity;
      if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
      if (body.root_cause !== undefined) updates.root_cause = body.root_cause;
      if (body.remediation !== undefined) updates.remediation = body.remediation;
      if (body.corrective_action !== undefined) updates.corrective_action = body.corrective_action;
      if (body.description !== undefined) updates.description = body.description;
      if (body.impact !== undefined) updates.impact = body.impact;

      if (body.status === "closed") updates.closed_at = new Date().toISOString();
      if (body.status && body.status !== "open") updates.resolved_at = new Date().toISOString();

      const { data: incident, error: updErr } = await admin
        .from("incidents")
        .update(updates)
        .eq("id", incidentId)
        .select()
        .single();
      if (updErr) return json({ error: updErr.message }, 500);

      // Auto-add timeline entry for status changes
      if (body.status) {
        await admin.from("incident_timeline").insert({
          incident_id: incidentId,
          event_type: body.status === "closed" ? "closed" : body.status === "reopened" ? "reopened" : "status_change",
          description: `Status changed to: ${body.status}${body.comment ? " — " + body.comment : ""}`,
          user_id: userData.user.id,
        });
      }
      if (body.root_cause && !(await hasTimelineEvent(admin, incidentId, "root_cause_added"))) {
        await admin.from("incident_timeline").insert({
          incident_id: incidentId,
          event_type: "root_cause_added",
          description: `Root cause identified: ${body.root_cause}`,
          user_id: userData.user.id,
        });
      }

      return json({ incident });
    }

    // POST /incident-management/:id/comment — add timeline comment
    if (req.method === "POST" && path.endsWith("/comment")) {
      const incidentId = path.replace(/\/comment$/, "");
      const body = await req.json();
      const { error } = await admin.from("incident_timeline").insert({
        incident_id: incidentId,
        event_type: "comment",
        description: body.comment,
        user_id: userData.user.id,
        metadata: body.metadata || {},
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("incident-management error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function hasTimelineEvent(admin: ReturnType<typeof createClient>, incidentId: string, eventType: string): Promise<boolean> {
  const { data } = await admin.from("incident_timeline").select("id").eq("incident_id", incidentId).eq("event_type", eventType).limit(1);
  return !!data && data.length > 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}