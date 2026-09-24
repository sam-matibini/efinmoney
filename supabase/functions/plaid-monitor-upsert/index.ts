import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidConfigured } from "../_shared/plaid.ts";
import { upsertPlaidMonitorIndividual } from "../_shared/plaidMonitor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!plaidConfigured()) return jsonResponse({ error: "Plaid not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      user_id?: string;
      given_name?: string;
      family_name?: string;
      date_of_birth?: string;
    };

    // Staff may screen another user; otherwise self.
    let targetUserId = user.id;
    if (body.user_id && body.user_id !== user.id) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "compliance"]);
      if (!roles?.length) return jsonResponse({ error: "Forbidden" }, 403);
      targetUserId = body.user_id;
    }

    const result = await upsertPlaidMonitorIndividual(supabase, {
      userId: targetUserId,
      givenName: body.given_name,
      familyName: body.family_name,
      dateOfBirth: body.date_of_birth,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error, skipped: result.skipped === true }, result.skipped ? 200 : 400);
    }
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    console.error("plaid-monitor-upsert", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
