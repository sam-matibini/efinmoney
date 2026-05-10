// Fetch live inquiry status from Persona. Useful as a fallback when webhooks
// haven't been delivered yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsRes, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
  const userId = claimsRes.claims.sub as string;

  const url = new URL(req.url);
  let inquiryId = url.searchParams.get("inquiryId");
  if (!inquiryId && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    inquiryId = body?.inquiryId || null;
  }
  if (!inquiryId) return json({ error: "inquiryId required" }, 400);

  // Caller must own this inquiry (or be an admin).
  const { data: kyc } = await supabase
    .from("kyc_verifications")
    .select("user_id")
    .eq("persona_inquiry_id", inquiryId)
    .maybeSingle();
  if (!kyc) return json({ error: "Inquiry not found" }, 404);
  if (kyc.user_id !== userId) {
    const { data: isAdmin } = await supabase.rpc("is_admin_user", { _uid: userId });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
  }

  const apiKey = Deno.env.get("PERSONA_API_KEY");
  if (!apiKey) return json({ error: "Persona not configured" }, 500);

  const res = await fetch(`https://api.withpersona.com/api/v1/inquiries/${inquiryId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Persona-Version": "2023-01-05",
      "Key-Inflection": "camel",
    },
  });
  const body = await res.json();
  if (!res.ok) return json({ error: "Persona API error", details: body }, 502);

  return json({
    inquiryId,
    status: body?.data?.attributes?.status,
    decision: body?.data?.attributes?.decision,
    raw: body,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
