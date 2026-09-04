// send-password-reset
// --------------------
// Generates a Supabase recovery link server-side (service role) and
// hands it to the branded `send-email` function so the user gets the
// eFinMoney-styled reset email instead of the stock Supabase template.
//
// Body: { email: string, next?: string }
//   email  — required. If no user has that email we still return 200
//            so we don't leak which addresses are registered (matches
//            the behaviour of supabase.auth.resetPasswordForEmail).
//   next   — optional path the user lands on after setting a new password
//            (defaults to "/auth").
//
// Auth: anonymous callable. We rate-limit at the call site (the
// `log_login_failure` flow already exists for repeated abuse).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildAppAuthConfirmUrl,
  extractHashedToken,
  getPublicAppOrigin,
} from "../_shared/authConfirmLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(500, { error: "Server misconfiguration" });
    }

    const { email, next } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json(400, { error: "Valid email is required" });
    }

    const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/auth";
    const appOrigin = getPublicAppOrigin();
    const redirectTo = `${appOrigin}/auth/confirm?type=recovery&next=${encodeURIComponent(safeNext)}`;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    const tokenHash = extractHashedToken(data?.properties);
    // No matching user, or the user is banned/suspended — reply OK so we
    // don't leak account existence. The email just isn't sent.
    if (error || !tokenHash) {
      console.warn("[send-password-reset] generateLink:", error?.message ?? "no token");
      return json(200, { ok: true });
    }

    const actionLink = buildAppAuthConfirmUrl({
      tokenHash,
      type: "recovery",
      next: safeNext,
      appOrigin,
    });

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: "password_reset",
        to: email,
        data: {
          action_link: actionLink,
          expires_in_minutes: 60,
        },
      }),
    });

    if (!sendRes.ok) {
      const body = await sendRes.text();
      console.error("[send-password-reset] send-email failed:", body);
      return json(502, { error: "Failed to dispatch email" });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("[send-password-reset] error:", e);
    return json(500, { error: "Unexpected error" });
  }
});
