import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sumsubFetch } from "../_shared/sumsub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isReviewer } = await admin.rpc("is_kyc_reviewer", { _uid: claims.claims.sub });
    if (!isReviewer) return json({ error: "Forbidden" }, 403);

    const { user_id, level_name } = await req.json();
    if (!user_id || !level_name) return json({ error: "Missing user_id/level_name" }, 400);

    const res = await sumsubFetch(
      "POST",
      `/resources/accessTokens?userId=${encodeURIComponent(user_id)}&levelName=${encodeURIComponent(level_name)}&ttlInSecs=1800`,
    );
    const j = await res.json();
    if (!res.ok) return json({ error: "Sumsub token failed", details: j }, 502);
    return json({ ok: true, access_token: j.token });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
