// Public JWKS endpoint - exposes the public half of INTERAC_PRIVATE_JWK
// Interac fetches this URL to verify the signed Request Object (JAR, RFC 9101).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const PRIVATE_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth"];
const REQUIRED_RSA_PUBLIC_FIELDS = ["kty", "n", "e"] as const;

function parseJwk(raw: string) {
  const firstPass: unknown = JSON.parse(raw);
  const normalized = typeof firstPass === "string" ? JSON.parse(firstPass) : firstPass;

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("INTERAC_PRIVATE_JWK must be a JSON object");
  }

  return normalized as Record<string, unknown>;
}

function getPrivateJwkSecret() {
  const hubValue = Deno.env.get("INTERAC_HUB_PRIVATE_JWK");
  if (hubValue) return { secretName: "INTERAC_HUB_PRIVATE_JWK", raw: hubValue };

  const legacyValue = Deno.env.get("INTERAC_PRIVATE_JWK");
  if (legacyValue) return { secretName: "INTERAC_PRIVATE_JWK", raw: legacyValue };

  return null;
}

function normalizeJwkStringField(jwk: Record<string, unknown>, field: string) {
  const value = jwk[field];
  if (typeof value !== "string") return;

  jwk[field] = value.trim().replace(/\s+/g, "").replace(/=+$/g, "");
}

function normalizePrivateJwk(jwk: Record<string, unknown>) {
  for (const field of [...REQUIRED_RSA_PUBLIC_FIELDS, "d", "p", "q", "dp", "dq", "qi"]) {
    normalizeJwkStringField(jwk, field);
  }

  normalizeJwkStringField(jwk, "alg");
  normalizeJwkStringField(jwk, "kid");
  normalizeJwkStringField(jwk, "use");

  return jwk;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  try {
    const privateJwkSecret = getPrivateJwkSecret();
    if (!privateJwkSecret) {
      return new Response(JSON.stringify({ error: "INTERAC_PRIVATE_JWK not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwk = normalizePrivateJwk(parseJwk(privateJwkSecret.raw));
    const pub: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(jwk)) {
      if (!PRIVATE_FIELDS.includes(k)) pub[k] = v;
    }
    for (const field of REQUIRED_RSA_PUBLIC_FIELDS) {
      if (!(field in pub) || typeof pub[field] !== "string" || !(pub[field] as string)) {
        throw new Error(`${privateJwkSecret.secretName} is missing required RSA field \"${field}\"`);
      }
    }
    if (!pub.use) pub.use = "sig";
    return new Response(JSON.stringify({ keys: [pub] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
