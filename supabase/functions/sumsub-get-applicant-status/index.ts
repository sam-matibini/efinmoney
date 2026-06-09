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

    const { applicant_id } = await req.json();
    if (!applicant_id) return json({ error: "Missing applicant_id" }, 400);

    const [statusRes, reviewRes] = await Promise.all([
      sumsubFetch("GET", `/resources/applicants/${encodeURIComponent(applicant_id)}/one`),
      sumsubFetch("GET", `/resources/applicants/${encodeURIComponent(applicant_id)}/status`),
    ]);
    const applicant = await statusRes.json();
    const status = await reviewRes.json();
    if (!statusRes.ok) return json({ error: "Sumsub fetch failed", details: applicant }, 502);

    const review = status?.review || {};
    const reviewResult = review.reviewResult || {};

    await admin
      .from("sumsub_verifications")
      .update({
        review_status: review.reviewStatus ?? null,
        review_answer: reviewResult.reviewAnswer ?? null,
        review_reject_type: reviewResult.reviewRejectType ?? null,
        moderation_comment: reviewResult.moderationComment ?? null,
        client_comment: reviewResult.clientComment ?? null,
        risk_labels: reviewResult.rejectLabels ?? [],
        raw_payload: { applicant, status },
      })
      .eq("applicant_id", applicant_id);

    return json({ ok: true, applicant, status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
