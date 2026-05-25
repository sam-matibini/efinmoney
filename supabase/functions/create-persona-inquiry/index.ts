// Edge function: create a Persona inquiry + one-time session token for the
// embedded SDK. Authenticated users only — caller must be the user being verified.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PERSONA_API = "https://api.withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

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

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    if (body?.userId && body.userId !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    const apiKey = Deno.env.get("PERSONA_API_KEY");
    const templateId = Deno.env.get("PERSONA_TEMPLATE_ID");
    const environment = Deno.env.get("PERSONA_ENVIRONMENT") || "production";
    if (!apiKey || !templateId) {
      console.error("Missing Persona env vars");
      return json({ error: "Persona is not configured" }, 500);
    }

    const { data: existingKyc } = await supabase
      .from("kyc_verifications")
      .select("persona_inquiry_id, persona_inquiry_status, verification_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingKyc?.persona_inquiry_id) {
      const submittedStatuses = ["pending_review", "approved", "rejected"];
      const submittedPersonaStates = ["completed", "needs_review", "approved", "declined", "expired", "failed"];

      if (
        submittedStatuses.includes(existingKyc.verification_status) ||
        (existingKyc.persona_inquiry_status && submittedPersonaStates.includes(existingKyc.persona_inquiry_status))
      ) {
        return json({
          templateId,
          environment,
          inquiryId: existingKyc.persona_inquiry_id,
          status: existingKyc.persona_inquiry_status || existingKyc.verification_status,
          alreadySubmitted: true,
        });
      }

      const resumed = await resumeInquiry(apiKey, existingKyc.persona_inquiry_id);
      if (resumed?.sessionToken) {
        await supabase
          .from("kyc_verifications")
          .update({
            persona_session_token: resumed.sessionToken,
            persona_inquiry_status: resumed.status || existingKyc.persona_inquiry_status || "created",
          })
          .eq("user_id", userId);

        return json({
          templateId,
          environment,
          inquiryId: existingKyc.persona_inquiry_id,
          sessionToken: resumed.sessionToken,
          status: resumed.status || existingKyc.persona_inquiry_status || "created",
        });
      }
    }

    // 1. Create inquiry
    const createRes = await fetch(`${PERSONA_API}/inquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": PERSONA_VERSION,
        "Key-Inflection": "camel",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            inquiryTemplateId: templateId,
            referenceId: userId,
          },
        },
      }),
    });

    const createBody = await createRes.json();
    if (!createRes.ok) {
      console.error("Persona create inquiry failed", createBody);
      return json({ error: "Failed to create verification session" }, 502);
    }

    const inquiryId = createBody?.data?.id;
    if (!inquiryId) return json({ error: "Persona returned no inquiry id" }, 502);

    // 2. Resume inquiry to obtain a session token (the SDK uses this to launch the embedded flow)
    const resumeRes = await fetch(`${PERSONA_API}/inquiries/${inquiryId}/resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": PERSONA_VERSION,
        "Key-Inflection": "camel",
      },
    });
    const resumeBody = await resumeRes.json();
    if (!resumeRes.ok) {
      console.error("Persona resume failed", resumeBody);
      return json({ error: "Failed to start verification session" }, 502);
    }
    const sessionToken = resumeBody?.meta?.sessionToken || resumeBody?.data?.attributes?.sessionToken;

    // 3. Persist on KYC record (using user's auth context — user owns this row)
    await supabase
      .from("kyc_verifications")
      .update({
        persona_inquiry_id: inquiryId,
        persona_inquiry_status: "created",
        persona_session_token: sessionToken,
      })
      .eq("user_id", userId);

    return json({
      templateId,
      sessionToken,
      inquiryId,
      environment,
    });
  } catch (err) {
    console.error("create-persona-inquiry error", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resumeInquiry(apiKey: string, inquiryId: string) {
  const resumeRes = await fetch(`${PERSONA_API}/inquiries/${inquiryId}/resume`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Persona-Version": PERSONA_VERSION,
      "Key-Inflection": "camel",
    },
  });

  const resumeBody = await resumeRes.json().catch(() => ({}));
  if (!resumeRes.ok) return null;

  return {
    sessionToken: resumeBody?.meta?.sessionToken || resumeBody?.data?.attributes?.sessionToken || null,
    status: resumeBody?.data?.attributes?.status || null,
  };
}
