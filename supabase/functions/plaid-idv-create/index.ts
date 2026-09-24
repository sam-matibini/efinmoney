import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidConfigured, plaidErrorMessage, plaidFetch, plaidEnv } from "../_shared/plaid.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!plaidConfigured()) {
      return jsonResponse({ error: "Plaid is not configured" }, 500);
    }

    const templateId = (Deno.env.get("PLAID_IDV_TEMPLATE_ID") || "").trim();
    if (!templateId) {
      return jsonResponse({
        error: "PLAID_IDV_TEMPLATE_ID is not set. Create an Identity Verification template in Plaid Dashboard.",
      }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone_number, country_code, address_country, date_of_birth")
      .eq("user_id", user.id)
      .maybeSingle();

    const fullName = String(profile?.full_name || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const givenName = parts[0] || undefined;
    const familyName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;

    const userBody: Record<string, unknown> = {
      client_user_id: user.id,
    };
    if (user.email) userBody.email_address = user.email;
    if (profile?.phone_number) userBody.phone_number = profile.phone_number;
    if (profile?.date_of_birth) userBody.date_of_birth = profile.date_of_birth;
    if (givenName || familyName) {
      userBody.name = {
        given_name: givenName || "Customer",
        family_name: familyName || "User",
      };
    }

    const createRes = await plaidFetch("/identity_verification/create", {
      template_id: templateId,
      is_shareable: false,
      is_idempotent: true,
      gave_consent: true,
      user: userBody,
    });
    if (!createRes.ok) {
      return jsonResponse({ error: plaidErrorMessage(createRes.json) }, 400);
    }

    const idvId = String(createRes.json.id || "");
    if (!idvId) return jsonResponse({ error: "Plaid IDV create returned no id" }, 500);

    await supabase.from("kyc_verifications").upsert(
      {
        user_id: user.id,
        plaid_identity_verification_id: idvId,
        plaid_idv_status: String(createRes.json.status || "active"),
        plaid_idv_payload: createRes.json,
        verification_provider: "plaid",
        verification_status: "in_progress",
        current_step: "identity",
      },
      { onConflict: "user_id", ignoreDuplicates: false },
    );

    // Link expects identity_verification.template_id (not session id).
    // Session id comes back later as metadata.link_session_id in onSuccess.
    const linkBody: Record<string, unknown> = {
      client_name: "eFinMoney",
      language: "en",
      country_codes: ["CA", "US"],
      user: {
        client_user_id: user.id,
        ...(user.email ? { email_address: user.email } : {}),
      },
      products: ["identity_verification"],
      identity_verification: { template_id: templateId },
    };
    const redirectUri = (Deno.env.get("PLAID_REDIRECT_URI") || "").trim();
    if (redirectUri.startsWith("https://")) linkBody.redirect_uri = redirectUri;

    const linkRes = await plaidFetch("/link/token/create", linkBody);
    if (!linkRes.ok) {
      return jsonResponse({ error: plaidErrorMessage(linkRes.json, "Failed to create IDV link token") }, 400);
    }

    return jsonResponse({
      identity_verification_id: idvId,
      status: createRes.json.status,
      link_token: linkRes.json.link_token,
      expiration: linkRes.json.expiration,
      plaid_env: plaidEnv(),
      shareable_url: createRes.json.shareable_url ?? null,
    });
  } catch (e) {
    console.error("plaid-idv-create", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
