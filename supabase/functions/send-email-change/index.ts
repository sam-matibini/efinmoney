// send-email-change
// -----------------
// Sends a branded "confirm your new email" message instead of the
// stock Supabase template.
//
// Body: { new_email: string, current_password?: string, next?: string }
//
// Auth: requires a signed-in user (Authorization header). The current
// password is re-verified inside this function (defence in depth —
// the client also checks it). The service-role key is used only to
// generate the email_change link; the user's actual email is not
// changed here — Supabase does that on link click via verifyOtp.

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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json(500, { error: "Server misconfiguration" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const { new_email, current_password, next } = await req.json();
    if (!new_email || typeof new_email !== "string" || !new_email.includes("@")) {
      return json(400, { error: "Valid new email is required" });
    }

    // 1. Verify the caller's session.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "Unauthenticated" });

    if (typeof current_password === "string" && current_password.length > 0) {
      const { error: pwErr } = await userClient.auth.signInWithPassword({
        email: user.email!,
        password: current_password,
      });
      if (pwErr) return json(403, { error: "Current password is incorrect" });
    }

    // 2. Reject if the new email is the same as the current one.
    if (new_email.toLowerCase() === (user.email ?? "").toLowerCase()) {
      return json(400, { error: "New email is the same as your current email" });
    }

    // 3. Generate the email_change link server-side.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/profile";
    const appOrigin = getPublicAppOrigin();
    const confirmUrl = `${appOrigin}/auth/confirm?type=email_change&next=${encodeURIComponent(safeNext)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "email_change_current",
      email: user.email!,
      newEmail: new_email,
      options: { redirectTo: confirmUrl },
    });

    const tokenHash = extractHashedToken(link?.properties);
    if (linkErr || !tokenHash) {
      console.error("[send-email-change] generateLink:", linkErr?.message);
      return json(500, { error: "Failed to generate confirmation link" });
    }

    const actionLink = buildAppAuthConfirmUrl({
      tokenHash,
      type: "email_change",
      next: safeNext,
      appOrigin,
    });

    // 4. Send the branded email to the NEW address.
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: "email_change",
        to: new_email,
        data: {
          new_email,
          action_link: actionLink,
          expires_in_hours: 24,
        },
      }),
    });

    if (!sendRes.ok) {
      console.error("[send-email-change] send-email failed:", await sendRes.text());
      return json(502, { error: "Failed to dispatch email" });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("[send-email-change] error:", e);
    return json(500, { error: "Unexpected error" });
  }
});
