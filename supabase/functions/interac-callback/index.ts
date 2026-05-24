// Interac OIDC - Callback handler
// Public endpoint hit by Interac after the user authenticates.
// Exchanges the code, validates ID token, fetches userinfo, updates KYC, and redirects back to the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ISSUER = (Deno.env.get("INTERAC_HUB_ISSUER_URL") ?? Deno.env.get("INTERAC_ISSUER_URL"))!;
const CLIENT_ID = (Deno.env.get("INTERAC_HUB_CLIENT_ID") ?? Deno.env.get("INTERAC_CLIENT_ID"))!;
const CLIENT_SECRET = Deno.env.get("INTERAC_HUB_CLIENT_SECRET") ?? Deno.env.get("INTERAC_CLIENT_SECRET") ?? "";
const APP_RETURN_BASE = Deno.env.get("INTERAC_APP_RETURN_BASE") || "https://efin.money";

let discoveryCache: any = null;
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

async function discover() {
  if (discoveryCache) return discoveryCache;
  const url = ISSUER.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
  discoveryCache = await r.json();
  return discoveryCache;
}

function appRedirect(qs: Record<string, string>) {
  const u = new URL(APP_RETURN_BASE.replace(/\/$/, "") + "/onboarding/identity");
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errParam = url.searchParams.get("error");

    if (errParam) {
      console.error("Interac returned error:", errParam, url.searchParams.get("error_description"));
      return appRedirect({ interac: "error", reason: errParam });
    }
    if (!code || !state) {
      return appRedirect({ interac: "error", reason: "missing_params" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session, error: sessErr } = await admin
      .from("interac_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (sessErr || !session) {
      return appRedirect({ interac: "error", reason: "invalid_state" });
    }
    // Single-use: delete immediately
    await admin.from("interac_sessions").delete().eq("state", state);

    if (new Date(session.expires_at) < new Date()) {
      return appRedirect({ interac: "error", reason: "expired_state" });
    }

    const oidc = await discover();

    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirect_uri,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: session.code_verifier,
    });

    const tokenRes = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenRes.status, tokenJson);
      return appRedirect({ interac: "error", reason: "token_exchange_failed" });
    }

    const { id_token, access_token } = tokenJson;
    if (!id_token) return appRedirect({ interac: "error", reason: "no_id_token" });

    // Validate ID token
    if (!jwksCache) jwksCache = createRemoteJWKSet(new URL(oidc.jwks_uri));
    let payload: any;
    try {
      const verified = await jwtVerify(id_token, jwksCache, {
        issuer: oidc.issuer,
        audience: CLIENT_ID,
      });
      payload = verified.payload;
    } catch (e) {
      console.error("ID token verification failed:", e);
      return appRedirect({ interac: "error", reason: "id_token_invalid" });
    }

    if (payload.nonce !== session.nonce) {
      console.error("Nonce mismatch");
      return appRedirect({ interac: "error", reason: "nonce_mismatch" });
    }

    // Fetch userinfo for richer verified claims
    let userinfo: any = {};
    try {
      const uir = await fetch(oidc.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (uir.ok) userinfo = await uir.json();
      else console.warn("userinfo fetch returned", uir.status);
    } catch (e) {
      console.warn("userinfo error:", e);
    }

    const claims = { ...payload, ...userinfo };
    const sub = String(payload.sub);

    // Update KYC verification
    const { error: updErr } = await admin
      .from("kyc_verifications")
      .update({
        interac_sub: sub,
        interac_claims: claims,
        interac_verification_status: "approved",
        interac_completed_at: new Date().toISOString(),
        verification_provider: "interac",
        id_verification_status: "approved",
        current_step: "address",
        verification_status: "in_progress",
      })
      .eq("user_id", session.user_id);

    if (updErr) {
      console.error("KYC update failed:", updErr);
      return appRedirect({ interac: "error", reason: "kyc_update_failed" });
    }

    return appRedirect({ interac: "success" });
  } catch (e) {
    console.error("interac-callback error:", e);
    return appRedirect({ interac: "error", reason: "server_error" });
  }
});
