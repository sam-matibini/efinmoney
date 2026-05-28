import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: adminRow } = await admin.from("admin_users").select("id, role").eq("id", userId).maybeSingle();
    if (!adminRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { match_id, disposition, notes } = body;
    if (!match_id || !["true_match", "false_positive", "escalated"].includes(disposition)) {
      return new Response(JSON.stringify({ error: "invalid input" }), { status: 400, headers: corsHeaders });
    }

    const { data: updated, error } = await admin
      .from("aml_matches")
      .update({
        disposition,
        notes: notes ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", match_id)
      .select("id, screening_id")
      .single();
    if (error) throw error;

    // If all matches of this screening are dispositioned non-true → flip profile back to clear
    const { data: screening } = await admin
      .from("aml_screenings")
      .select("id, user_id")
      .eq("id", updated.screening_id)
      .single();

    const { data: remaining } = await admin
      .from("aml_matches")
      .select("disposition")
      .eq("screening_id", updated.screening_id);

    const hasTrue = remaining?.some((m: any) => m.disposition === "true_match" || m.disposition === "escalated");
    const allReviewed = remaining?.every((m: any) => m.disposition !== "pending");

    if (allReviewed && !hasTrue && screening?.user_id) {
      await admin.from("profiles").update({ aml_status: "clear" }).eq("user_id", screening.user_id);
    } else if (hasTrue && screening?.user_id) {
      await admin.from("profiles").update({ aml_status: "review" }).eq("user_id", screening.user_id);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("aml-review error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
