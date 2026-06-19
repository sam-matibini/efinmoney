import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);
const RAW_ENV = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
const PLAID_ENV = ALLOWED_ENVS.has(RAW_ENV) ? RAW_ENV : "production";
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;

function plaidCredentials() {
  const clientId = (Deno.env.get("PLAID_CLIENT_ID") || "").trim();
  const secret = (Deno.env.get("PLAID_SECRET") || "").trim();
  return { clientId, secret };
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

    const res = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        client_name: "eFinMoney",
        language: "en",
        country_codes: ["CA"],
        user: { client_user_id: user.id },
        products: ["auth"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Plaid link/token/create error", { env: PLAID_ENV, data });
      return jsonResponse({
        error: data.error_message || data.display_message || "Plaid error",
        plaid_error_code: data.error_code,
      }, 502);
    }

    return jsonResponse({ link_token: data.link_token, expiration: data.expiration });
  } catch (e) {
    console.error("plaid-create-link-token error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
