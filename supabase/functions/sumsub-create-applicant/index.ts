import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sumsubFetch } from "../_shared/sumsub.ts";

const LEVEL_NAME = Deno.env.get("SUMSUB_LEVEL_NAME") ?? "basic-kyc-level";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const adminId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin/compliance only
    const { data: isReviewer } = await admin.rpc("is_kyc_reviewer", { _uid: adminId });
    if (!isReviewer) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || "");
    if (!userId.match(/^[0-9a-f-]{36}$/i)) return json({ error: "Invalid user_id" }, 400);

    const levelName = String(body.level_name || LEVEL_NAME);

    // Check existing
    const { data: existing } = await admin
      .from("sumsub_verifications")
      .select("applicant_id, level_name")
      .eq("user_id", userId)
      .eq("level_name", levelName)
      .maybeSingle();

    let applicantId = existing?.applicant_id;

    if (!applicantId) {
      // Create applicant in Sumsub
      const createRes = await sumsubFetch("POST", `/resources/applicants?levelName=${encodeURIComponent(levelName)}`, {
        externalUserId: userId,
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        return json({ error: "Sumsub create failed", details: createJson }, 502);
      }
      applicantId = createJson.id as string;

      await admin.from("sumsub_verifications").upsert({
        user_id: userId,
        applicant_id: applicantId,
        level_name: levelName,
        requested_by_admin_id: adminId,
      }, { onConflict: "user_id,level_name" });
    }

    // Mint access token
    const tokenRes = await sumsubFetch(
      "POST",
      `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=1800`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return json({ error: "Sumsub token failed", details: tokenJson }, 502);

    return json({ ok: true, applicant_id: applicantId, level_name: levelName, access_token: tokenJson.token, user_id: userId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
