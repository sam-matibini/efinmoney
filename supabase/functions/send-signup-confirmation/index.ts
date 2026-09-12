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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const alreadyRegistered = (msg: string) =>
  /already registered|already been registered|user already exists/i.test(msg);

type AdminClient = ReturnType<typeof createClient>;

async function findExistingUser(admin: AdminClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  if (profileRow?.user_id) {
    const { data, error } = await admin.auth.admin.getUserById(profileRow.user_id);
    if (!error && data?.user) return data.user;
  }
  return null;
}

function asTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

    const fullName = name || [first_name, last_name].filter(Boolean).join(" ").trim();
    const userMetadata: Record<string, unknown> = {};
    if (fullName) userMetadata.full_name = fullName;
    if (first_name) userMetadata.first_name = first_name;
    if (last_name) userMetadata.last_name = last_name;
    if (country) userMetadata.country = country;
    if (account_type) userMetadata.account_type = account_type;

    const isBusiness = account_type === "business";
    const safeRedirect = typeof redirect_to === "string" && redirect_to.startsWith("/")
      ? redirect_to
      : isBusiness
        ? "/onboarding/business/details"
        : "/onboarding/identity";

    // Step 1 — create the user (unconfirmed). If this email already started
    // signup, resume that account instead of returning 409 (the client would
    // otherwise show a generic "non-2xx" toast).
    let userId: string;
    let createdNew = false;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: userMetadata,
    });

    if (created?.user && !createErr) {
      userId = created.user.id;
      createdNew = true;
    } else {
      const msg = createErr?.message || "Failed to create user";
      if (!alreadyRegistered(msg)) {
        return json(400, { error: msg });
      }
      const existing = await findExistingUser(admin, email);
      if (!existing) {
        return json(409, {
          error: "This email already has an account. Sign in instead.",
        });
      }
      if (existing.email_confirmed_at) {
        return json(409, {
          error: "This email already has an account. Sign in instead.",
        });
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: userMetadata,
      });
      if (updErr) {
        console.warn("[send-signup-confirmation] update unconfirmed user:", updErr.message);
      }
      userId = existing.id;
    }

    // Step 2 — generate a confirmation token (no stock Supabase email).
    const appOrigin = getPublicAppOrigin();
    const redirectTo = `${appOrigin}/auth/confirm?type=signup&next=${encodeURIComponent(safeRedirect)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      options: { redirectTo },
    });

    const tokenHash = extractHashedToken(link?.properties);
    if (linkErr || !tokenHash) {
      if (createdNew) await admin.auth.admin.deleteUser(userId);
      console.error("[send-signup-confirmation] generateLink:", linkErr?.message);
      return json(500, { error: "Failed to generate confirmation link" });
    }

    const actionLink = buildAppAuthConfirmUrl({
      tokenHash,
      type: "signup",
      next: safeRedirect,
      appOrigin,
    });

    // Step 2.5 — patch profile fields. Business signups skip DOB / nationality.
    if (profile && typeof profile === "object") {
      const patch: Record<string, string | null> = {};
      if (fullName) patch.full_name = fullName;
      if (profile.street) patch.street_address = profile.street;
      if (profile.city) patch.city = profile.city;
      if (profile.state) patch.state_province = profile.state;
      if (profile.postal_code) patch.postal_code = profile.postal_code;
      if (profile.country_code) patch.address_country = profile.country_code;
      if (profile.phone) patch.phone_number = profile.phone;
      if (!isBusiness) {
        if (profile.date_of_birth) patch.date_of_birth = profile.date_of_birth;
        if (profile.occupation) patch.occupation = profile.occupation;
        if (profile.nationality) patch.nationality = profile.nationality;
      }

      if (Object.keys(patch).length > 0) {
        const { error: patchErr } = await admin
          .from("profiles")
          .update(patch)
          .eq("user_id", userId);
        if (patchErr) {
          console.warn("[send-signup-confirmation] profile patch:", patchErr.message);
        }
      }
    }

    // Step 2.6 — seed / refresh the KYB row. Never fail signup if this errors.
    if (isBusiness && business && typeof business === "object" && !Array.isArray(business)) {
      try {
        const legalName = asTrimmed(business.legal_name);
        const entityType = ENTITY_TYPES.has(String(business.entity_type))
          ? String(business.entity_type)
          : "corporation";
        const incorporationCountry = (
          asTrimmed(business.country_code) ||
          asTrimmed(country) ||
          "CA"
        )
          .slice(0, 2)
          .toUpperCase();

        if (legalName) {
          const row = {
            owner_user_id: userId,
            legal_name: legalName,
            entity_type: entityType,
            incorporation_country: incorporationCountry,
            incorporation_region: asTrimmed(business.state),
            registration_number: asTrimmed(business.registration_number),
            tax_id: asTrimmed(business.tax_id),
            industry: asTrimmed(business.industry),
            website: asTrimmed(business.website),
            business_phone: asTrimmed(business.business_phone),
            business_email: asTrimmed(business.business_email) || email,
            street_address: asTrimmed(business.street),
            city: asTrimmed(business.city),
            state_province: asTrimmed(business.state),
            postal_code: asTrimmed(business.postal_code),
            address_country: incorporationCountry,
            kyb_status: "in_progress",
            current_step: "details",
          };
          const { error: bizErr } = await admin
            .from("business_profiles")
            .upsert(row, { onConflict: "owner_user_id" });
          if (bizErr) {
            console.warn("[send-signup-confirmation] business_profiles upsert:", bizErr.message);
          }
        }
      } catch (bizCatch) {
        console.warn("[send-signup-confirmation] business seed:", bizCatch);
      }
    }

    // Step 3 — send the branded email. If dispatch fails the account still
    // exists; return 200 so the client can show "check your inbox" + resend.
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
      return json(200, { ok: true, user_id: userId, email_sent: false });
    }

    return json(200, { ok: true, user_id: userId, email_sent: true });
  } catch (e) {
    console.error("[send-signup-confirmation] error:", e);
    return json(500, { error: "Unexpected error" });
  }
});
