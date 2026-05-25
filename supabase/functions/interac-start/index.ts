// Interac OIDC - Start verification
// Returns an authorization URL the client should redirect to.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importJWK } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ISSUER = Deno.env.get("INTERAC_HUB_ISSUER_URL") ?? Deno.env.get("INTERAC_ISSUER_URL")!;
const CLIENT_ID = Deno.env.get("INTERAC_HUB_CLIENT_ID") ?? Deno.env.get("INTERAC_CLIENT_ID")!;
const REDIRECT_URI = Deno.env.get("INTERAC_HUB_REDIRECT_URI") ?? Deno.env.get("INTERAC_REDIRECT_URI")!;
const SCOPES = Deno.env.get("INTERAC_HUB_SCOPES") ?? Deno.env.get("INTERAC_SCOPES") ?? "openid general_scope";
const PRIVATE_JWK_RAW = Deno.env.get("INTERAC_HUB_PRIVATE_JWK") ?? Deno.env.get("INTERAC_PRIVATE_JWK");

let discoveryCache: { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint: string; jwks_uri: string; issuer: string } | null = null;

function parseJwk(raw: string) {
  const firstPass: unknown = JSON.parse(raw);
  const normalized = typeof firstPass === "string" ? JSON.parse(firstPass) : firstPass;

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("INTERAC_PRIVATE_JWK must be a JSON object");
  }

  return normalized as Record<string, unknown>;
}

async function discover() {
  if (discoveryCache) return discoveryCache;
  const url = ISSUER.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
  discoveryCache = await r.json();
  return discoveryCache!;
}

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomB64Url(byteLen = 32) {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

async function sha256B64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return b64url(new Uint8Array(hash));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    if (!ISSUER || !CLIENT_ID || !REDIRECT_URI) {
      return new Response(JSON.stringify({ error: "Interac not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const oidc = await discover();

    const state = randomB64Url(24);
    const nonce = randomB64Url(24);
    const codeVerifier = randomB64Url(32);
    const codeChallenge = await sha256B64Url(codeVerifier);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Clean expired sessions opportunistically
    await admin.from("interac_sessions").delete().lt("expires_at", new Date().toISOString());

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insErr } = await admin.from("interac_sessions").insert({
      state, user_id: userId, nonce, code_verifier: codeVerifier, redirect_uri: REDIRECT_URI, expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    await admin.from("kyc_verifications")
      .update({ interac_session_id: state, interac_verification_status: "pending" })
      .eq("user_id", userId);

    // Build JAR (RFC 9101) signed Request Object
    const privateJwkRaw = PRIVATE_JWK_RAW;
    if (!privateJwkRaw) {
      return new Response(JSON.stringify({ error: "Interac private JWK not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let privateJwk: Record<string, unknown>;
    try {
      privateJwk = parseJwk(privateJwkRaw);
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "INTERAC_PRIVATE_JWK is not valid JSON" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const alg = (privateJwk.alg as string) || "PS256";
    const kid = privateJwk.kid as string | undefined;
    const signingKey = await importJWK(privateJwk as any, alg);

    const now = Math.floor(Date.now() / 1000);
    const requestJwt = await new SignJWT({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })
      .setProtectedHeader({ alg, ...(kid ? { kid } : {}), typ: "oauth-authz-req+jwt" })
      .setIssuer(CLIENT_ID)
      .setAudience(oidc.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setJti(randomB64Url(16))
      .sign(signingKey);

    const url = new URL(oidc.authorization_endpoint);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("request", requestJwt);

    return new Response(JSON.stringify({ authorization_url: url.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("interac-start error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
