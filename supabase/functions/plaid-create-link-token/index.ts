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
  // E.164: +1 + 10 digits
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

    // Prefill phone only in production — sandbox rejects real numbers (use Plaid seeded phones there).
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
      if (phone) {
        userPayload.phone_number = phone;
      }
    }

    const res = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        client_name: "eFinMoney",
        language: "en",
        country_codes: ["CA"],
        user: userPayload,
        products: ["auth"],
        // Prefer instant bank login — disable Plaid micro-deposit verification paths
        auth: {
          instant_match_enabled: true,
          automated_microdeposits_enabled: false,
          same_day_microdeposits_enabled: false,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Plaid link/token/create error", { env: PLAID_ENV, data });
      const msg = data.error_message || data.display_message || "Plaid error";
      // Common misconfig: sandbox secret with production env (or reverse)
      const hint = /invalid.*(client|secret|api.key)/i.test(String(msg))
        ? ` Check PLAID_SECRET matches PLAID_ENV=${PLAID_ENV}.`
        : "";
      return jsonResponse({
        error: `${msg}${hint}`,
        plaid_error_code: data.error_code,
        plaid_env: PLAID_ENV,
      }, 502);
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
