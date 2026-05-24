// Interac OIDC - Exchange handler (called from the /callback React route via POST)
// Takes { code, state }, exchanges for tokens, validates ID token, fetches userinfo,
// updates KYC, and returns JSON. The browser then navigates to /onboarding/identity?interac=...
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet, SignJWT, importJWK } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ISSUER = Deno.env.get("INTERAC_HUB_ISSUER_URL") ?? Deno.env.get("INTERAC_ISSUER_URL")!;
const CLIENT_ID = Deno.env.get("INTERAC_HUB_CLIENT_ID") ?? Deno.env.get("INTERAC_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("INTERAC_HUB_CLIENT_SECRET") ?? Deno.env.get("INTERAC_CLIENT_SECRET") ?? "";
const PRIVATE_JWK_RAW = Deno.env.get("INTERAC_HUB_PRIVATE_JWK") ?? Deno.env.get("INTERAC_PRIVATE_JWK");

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

function fail(reason: string, status = 200) {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : null;
    const state = typeof body.state === "string" ? body.state : null;
    if (!code || !state) return fail("missing_params");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session, error: sessErr } = await admin
      .from("interac_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (sessErr || !session) return fail("invalid_state");

    // Single-use: delete immediately
    await admin.from("interac_sessions").delete().eq("state", state);

    if (new Date(session.expires_at) < new Date()) return fail("expired_state");

    const oidc = await discover();

    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirect_uri,
      client_id: CLIENT_ID,
      code_verifier: session.code_verifier,
    };

    if (CLIENT_SECRET) {
      tokenParams.client_secret = CLIENT_SECRET;
    } else if (PRIVATE_JWK_RAW) {
      // private_key_jwt client assertion (RFC 7523)
      try {
        const jwk = JSON.parse(PRIVATE_JWK_RAW);
        const alg = (jwk.alg as string) || "PS256";
        const kid = jwk.kid as string | undefined;
        const key = await importJWK(jwk, alg);
        const now = Math.floor(Date.now() / 1000);
        const assertion = await new SignJWT({})
          .setProtectedHeader({ alg, ...(kid ? { kid } : {}), typ: "JWT" })
          .setIssuer(CLIENT_ID)
          .setSubject(CLIENT_ID)
          .setAudience(oidc.token_endpoint)
          .setIssuedAt(now)
          .setExpirationTime(now + 300)
          .setJti(crypto.randomUUID())
          .sign(key);
        tokenParams.client_assertion_type = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
        tokenParams.client_assertion = assertion;
      } catch (e) {
        console.error("Failed to build client assertion:", e);
        return fail("client_assertion_failed");
      }
    }

    const tokenBody = new URLSearchParams(tokenParams);

    const tokenRes = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenRes.status, tokenJson);
      return fail("token_exchange_failed");
    }

    const { id_token, access_token } = tokenJson;
    if (!id_token) return fail("no_id_token");

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
      return fail("id_token_invalid");
    }

    if (payload.nonce !== session.nonce) return fail("nonce_mismatch");

    let userinfo: any = {};
    try {
      const uir = await fetch(oidc.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (uir.ok) userinfo = await uir.json();
    } catch (e) {
      console.warn("userinfo error:", e);
    }

    const claims = { ...payload, ...userinfo };
    const sub = String(payload.sub);

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
      return fail("kyc_update_failed");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("interac-exchange error:", e);
    return fail("server_error", 500);
  }
});
