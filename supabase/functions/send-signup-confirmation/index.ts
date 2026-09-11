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
//   business?: { legal_name, registration_number, entity_type, tax_id?,
//   industry?, website?, business_phone?, business_email?, street?,
//   city?, state?, postal_code?, country_code? },
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
      business,
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
    const isBusiness = account_type === "business";
    const safeRedirect = typeof redirect_to === "string" && redirect_to.startsWith("/")
      ? redirect_to
      : isBusiness
        ? "/onboarding/business/details"
        : "/onboarding/identity";
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
    // Business signups skip date of birth and nationality — those belong
    // on beneficial owners during KYB, not on the company login.
    if (profile && typeof profile === "object") {
      const patch: Record<string, string | null> = {};
      if (fullName)              patch.full_name = fullName;
      if (profile.street)        patch.street_address = profile.street;
      if (profile.city)          patch.city = profile.city;
      if (profile.state)         patch.state_province = profile.state;
      if (profile.postal_code)   patch.postal_code = profile.postal_code;
      if (profile.country_code)  patch.address_country = profile.country_code;
      if (profile.phone)         patch.phone_number = profile.phone;
      if (!isBusiness) {
        if (profile.date_of_birth) patch.date_of_birth = profile.date_of_birth;
        if (profile.occupation)    patch.occupation = profile.occupation;
        if (profile.nationality)   patch.nationality = profile.nationality;
      }

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

    // Step 2.6 — seed the KYB business profile so company details from
    // signup are waiting on /onboarding/business/details.
    if (isBusiness && business && typeof business === "object") {
      const ENTITY_TYPES = new Set([
        "sole_proprietorship",
        "partnership",
        "corporation",
        "llc",
        "cooperative",
        "ngo",
        "trust",
        "other",
      ]);
      const legalName = typeof business.legal_name === "string" ? business.legal_name.trim() : "";
      const entityType = ENTITY_TYPES.has(business.entity_type) ? business.entity_type : "corporation";
      const incorporationCountry =
        (typeof business.country_code === "string" && business.country_code.trim()) ||
        (typeof country === "string" && country.trim()) ||
        "CA";

      if (legalName) {
        const { error: bizErr } = await admin.from("business_profiles").insert({
          owner_user_id: created.user.id,
          legal_name: legalName,
          entity_type: entityType,
          incorporation_country: String(incorporationCountry).slice(0, 2).toUpperCase(),
          incorporation_region: typeof business.state === "string" ? business.state.trim() || null : null,
          registration_number:
            typeof business.registration_number === "string"
              ? business.registration_number.trim() || null
              : null,
          tax_id: typeof business.tax_id === "string" ? business.tax_id.trim() || null : null,
          industry: typeof business.industry === "string" ? business.industry.trim() || null : null,
          website: typeof business.website === "string" ? business.website.trim() || null : null,
          business_phone:
            typeof business.business_phone === "string"
              ? business.business_phone.trim() || null
              : null,
          business_email:
            typeof business.business_email === "string"
              ? business.business_email.trim() || email
              : email,
          street_address: typeof business.street === "string" ? business.street.trim() || null : null,
          city: typeof business.city === "string" ? business.city.trim() || null : null,
          state_province: typeof business.state === "string" ? business.state.trim() || null : null,
          postal_code:
            typeof business.postal_code === "string" ? business.postal_code.trim() || null : null,
          address_country: String(incorporationCountry).slice(0, 2).toUpperCase(),
          kyb_status: "in_progress",
          current_step: "details",
        });
        if (bizErr) {
          console.warn("[send-signup-confirmation] business_profiles insert:", bizErr.message);
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
