import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { toE164 } from "../_shared/phone-e164.ts";

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);
const RAW_ENV = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
const PLAID_ENV = ALLOWED_ENVS.has(RAW_ENV) ? RAW_ENV : "production";
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;

function plaidCredentials() {
  const clientId = (Deno.env.get("PLAID_CLIENT_ID") || "").trim();
  const secret = (Deno.env.get("PLAID_SECRET") || "").trim();
  return { clientId, secret };
}

/** NANP (+1) mobiles only — what Plaid Returning User accepts for CA/US. */
function nanpE164(phone: string | null | undefined, countryHint?: string | null): string | undefined {
  const e164 = toE164(phone, countryHint || "CA") || toE164(phone, "US");
  if (!e164) return undefined;
  if (!/^\+1\d{10}$/.test(e164)) return undefined;
  return e164;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { clientId, secret } = plaidCredentials();
    if (!clientId || !secret) {
      return jsonResponse({
        error: "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET on the edge function.",
      }, 500);
    }

    const body = await req.json().catch(() => ({})) as {
      redirect_uri?: string;
      language?: string;
      country_codes?: string[];
    };

    const userPayload: Record<string, unknown> = { client_user_id: user.id };
    if (user.email) userPayload.email_address = user.email;

    if (PLAID_ENV === "production") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone_number, country_code, address_country")
        .eq("user_id", user.id)
        .maybeSingle();

      const phone = nanpE164(
        profile?.phone_number || user.phone || null,
        profile?.address_country || profile?.country_code || "CA",
      );
      if (phone) userPayload.phone_number = phone;
    }

    const requestedCodes = Array.isArray(body.country_codes) ? body.country_codes : [];
    const country_codes = [...new Set(
      requestedCodes
        .map((c) => String(c || "").toUpperCase())
        .filter((c) => c === "CA" || c === "US"),
    )];
    if (country_codes.length === 0) country_codes.push("CA", "US");

    // Prefer Instant Auth (bank login). Instant Match is a different flow
    // (manual account numbers) and can open a blank "Verify your identity" pane.
    // Balance is not a Link product — live balances use /accounts/balance/get on Auth items.
    const linkBody: Record<string, unknown> = {
      client_id: clientId,
      secret,
      client_name: "eFinMoney",
      language: body.language === "fr" ? "fr" : "en",
      country_codes,
      user: userPayload,
      products: ["auth"],
      auth: {
        auth_type_select_enabled: false,
        instant_match_enabled: false,
        automated_microdeposits_enabled: false,
        same_day_microdeposits_enabled: false,
        instant_microdeposits_enabled: false,
      },
    };

    // OAuth banks (many CA institutions) need a registered https redirect URI.
    const redirectUri = String(body.redirect_uri || Deno.env.get("PLAID_REDIRECT_URI") || "").trim();
    if (redirectUri.startsWith("https://") || (PLAID_ENV !== "production" && redirectUri.startsWith("http://"))) {
      linkBody.redirect_uri = redirectUri;
    }

    const res = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(linkBody),
    });
    let data = await res.json();

    // Secret slot is full so PLAID_REDIRECT_URI may not be registered in Dashboard.
    // Retry without redirect so Instant Auth still works (OAuth banks need the URI later).
    if (!res.ok && linkBody.redirect_uri && /redirect/i.test(String(data.error_message || data.error_code || ""))) {
      console.warn("plaid-create-link-token: retrying without redirect_uri", data.error_code || data.error_message);
      delete linkBody.redirect_uri;
      const retryRes = await fetch(`${PLAID_BASE}/link/token/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkBody),
      });
      data = await retryRes.json();
      if (retryRes.ok) {
        return jsonResponse({
          link_token: data.link_token,
          expiration: data.expiration,
          plaid_env: PLAID_ENV,
          redirect_uri_omitted: true,
        });
      }
    }

    if (!data?.link_token) {
      console.error("Plaid link/token/create error", { env: PLAID_ENV, data, redirectUri: linkBody.redirect_uri });
      const msg = data.error_message || data.display_message || "Plaid error";
      const hint = /invalid.*(client|secret|api.key)/i.test(String(msg))
        ? ` Check PLAID_SECRET matches PLAID_ENV=${PLAID_ENV}.`
        : /redirect/i.test(String(msg))
          ? " Register https://efin.money/plaid-oauth in the Plaid Dashboard (Team → API → Allowed redirect URIs)."
          : "";
      // Return 200 with error so the web client can read the message (invoke hides non-2xx bodies).
      return jsonResponse({
        error: `${msg}${hint}`,
        plaid_error_code: data.error_code,
        plaid_env: PLAID_ENV,
      });
    }

    return jsonResponse({
      link_token: data.link_token,
      expiration: data.expiration,
      plaid_env: PLAID_ENV,
    });
  } catch (e) {
    console.error("plaid-create-link-token error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
