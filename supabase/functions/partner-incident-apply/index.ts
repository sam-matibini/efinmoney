// Phase 13 — manual suspend / resume of a partner or corridor.
// Pricing-manager authenticated; every change is audited like the auto path.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    partner_id: z.string().uuid(),
    corridor_key: z.string().max(120).nullable().optional(),
    reason: z.string().min(3).max(500),
    cooldown_minutes: z.number().int().min(0).max(43200).optional(),
    auto_restore: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("resume"),
    suspension_id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
    if (!isManager) return json({ success: false, error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
    }
    const body = parsed.data;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (body.action === "resume") {
      const { data: row, error } = await supabase
        .from("partner_suspensions")
        .update({
          status: "lifted",
          lifted_at: nowIso,
          lifted_by: user.id,
          lift_reason: body.reason ?? "Manually resumed",
        })
        .eq("id", body.suspension_id)
        .eq("status", "active")
        .select("id, partner_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return json({ success: false, error: "No active suspension with that id" }, 404);

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "partner_suspension_lifted",
        table_name: "partner_suspensions",
        record_id: row.id,
        new_data: { partner_id: row.partner_id, reason: body.reason ?? "Manually resumed" },
      });

      return json({ success: true, status: "lifted" });
    }

    const cooldown = body.cooldown_minutes ?? 0;
    const { data: row, error } = await supabase
      .from("partner_suspensions")
      .insert({
        partner_id: body.partner_id,
        corridor_key: body.corridor_key ?? null,
        scope: body.corridor_key ? "corridor" : "partner",
        reason: body.reason,
        trigger_source: "manual",
        trigger_metrics: {},
        status: "active",
        auto_restore: body.auto_restore ?? false,
        cooldown_minutes: cooldown,
        suspended_from: nowIso,
        suspended_until: cooldown > 0 ? new Date(nowMs + cooldown * 60_000).toISOString() : null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "partner_suspended_manual",
      table_name: "partner_suspensions",
      record_id: row.id,
      new_data: {
        partner_id: body.partner_id,
        corridor_key: body.corridor_key ?? null,
        reason: body.reason,
      },
    });

    return json({ success: true, status: "active", suspension_id: row.id });
  } catch (e) {
    console.error("partner-incident-apply failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
