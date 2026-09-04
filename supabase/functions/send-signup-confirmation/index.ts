// send-signup-confirmation
// -------------------------
// Creates the user via service role (email_confirm: false) and
// generates a branded confirmation email through `send-email`.
// Replaces Supabase's stock "Confirm your signup" template.
//
// Body: {
//   email, password, name?, first_name?, last_name?, country?,
//   account_type?, profile?: { street?, city?, state?, postal_code?,
//   country_code?, phone?, date_of_birth?, occupation?, nationality? },
//   redirect_to?
// }
//
// Auth: anonymous callable. Rate-limit at the call site if needed.

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

    const {
      email,
      password,
      name,
      first_name,
      last_name,
      country,
      account_type,
      profile,
      redirect_to,
    } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return json(400, { error: "Valid email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Build user_metadata so the handle_new_user trigger + the rest
    // of the post-signup pipeline work the same as before.
    const fullName = name || [first_name, last_name].filter(Boolean).join(" ").trim();
    const userMetadata: Record<string, unknown> = {};
    if (fullName) userMetadata.full_name = fullName;
    if (first_name) userMetadata.first_name = first_name;
    if (last_name) userMetadata.last_name = last_name;
    if (country) userMetadata.country = country;
    if (account_type) userMetadata.account_type = account_type;

    // Step 1 — create the user (unconfirmed). email_confirm: false means
    // the user can't sign in until they click the link we send.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: userMetadata,
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || "Failed to create user";
      // Map common Supabase errors to friendlier responses
      const status = /already registered|already been registered/i.test(msg) ? 409 : 400;
      return json(status, { error: msg });
    }

    // Step 2 — generate a confirmation token (no stock Supabase email).
    // Email CTA must land on our app /auth/confirm, not /auth/v1/verify.
    const safeRedirect = typeof redirect_to === "string" && redirect_to.startsWith("/")
      ? redirect_to
      : "/onboarding/account-type";
    const appOrigin = getPublicAppOrigin();
    const redirectTo = `${appOrigin}/auth/confirm?type=signup&next=${encodeURIComponent(safeRedirect)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      options: { redirectTo },
    });

    const tokenHash = extractHashedToken(link?.properties);
    if (linkErr || !tokenHash) {
      // Clean up the half-created user so they don't end up in a
      // unconfirmable state.
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("[send-signup-confirmation] generateLink:", linkErr?.message);
      return json(500, { error: "Failed to generate confirmation link" });
    }

    const actionLink = buildAppAuthConfirmUrl({
      tokenHash,
      type: "signup",
      next: safeRedirect,
      appOrigin,
    });

    // Step 2.5 — apply the extended profile fields (street, city, phone,
    // etc.) so the user lands on the next page with their data already
    // saved. handle_new_user() has already created the profile row from
    // user_metadata; this just patches the extra fields onto it.
    if (profile && typeof profile === "object") {
      const patch: Record<string, string | null> = {};
      if (profile.street)        patch.street_address = profile.street;
      if (profile.city)          patch.city = profile.city;
      if (profile.state)         patch.state_province = profile.state;
      if (profile.postal_code)   patch.postal_code = profile.postal_code;
      if (profile.country_code)  patch.address_country = profile.country_code;
      if (profile.phone)         patch.phone_number = profile.phone;
      if (profile.date_of_birth) patch.date_of_birth = profile.date_of_birth;
      if (profile.occupation)    patch.occupation = profile.occupation;
      if (profile.nationality)   patch.nationality = profile.nationality;

      if (Object.keys(patch).length > 0) {
        const { error: patchErr } = await admin
          .from("profiles")
          .update(patch)
          .eq("user_id", created.user.id);
        if (patchErr) {
          console.warn("[send-signup-confirmation] profile patch:", patchErr.message);
          // Non-fatal — confirmation email still goes out.
        }
      }
    }

    // Step 3 — send the branded email.
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: "signup_confirmation",
        to: email,
        data: {
          name: fullName,
          action_link: actionLink,
          expires_in_hours: 24,
        },
      }),
    });

    if (!sendRes.ok) {
      console.error("[send-signup-confirmation] send-email failed:", await sendRes.text());
      // Don't delete the user — they can still request a new link.
      return json(502, { error: "Failed to dispatch email" });
    }

    return json(200, { ok: true, user_id: created.user.id });
  } catch (e) {
    console.error("[send-signup-confirmation] error:", e);
    return json(500, { error: "Unexpected error" });
  }
});
