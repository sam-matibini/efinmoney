import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateApiKey } from "../_shared/partnerApiAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Admin-only: issue a new partner API key. The raw key is returned once. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth } = await anon.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const partnerId = body?.partner_id ? String(body.partner_id) : "";
    const label = body?.label ? String(body.label) : null;
    const env = body?.env === "test" ? "test" : "live";
    if (!partnerId) return json({ error: "partner_id is required" }, 400);

    const { data: partner } = await supabase
      .from("api_partners")
      .select("id")
      .eq("id", partnerId)
      .maybeSingle();
    if (!partner) return json({ error: "Partner not found" }, 404);

    const { key, hash, prefix } = await generateApiKey(env);
    const { data: inserted, error } = await supabase
      .from("api_partner_keys")
      .insert({ partner_id: partnerId, key_hash: hash, key_prefix: prefix, label, created_by: user.id })
      .select("id, key_prefix, label, created_at")
      .single();
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, key, key_record: inserted });
  } catch (e) {
    console.error("[api-partner-key-create]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
