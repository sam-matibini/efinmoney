// Public JWKS endpoint - exposes the public half of INTERAC_PRIVATE_JWK
// Interac fetches this URL to verify the signed Request Object (JAR, RFC 9101).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const PRIVATE_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth"];

function parseJwk(raw: string) {
  const firstPass: unknown = JSON.parse(raw);
  const normalized = typeof firstPass === "string" ? JSON.parse(firstPass) : firstPass;

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("INTERAC_PRIVATE_JWK must be a JSON object");
  }

  return normalized as Record<string, unknown>;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  try {
    const raw = Deno.env.get("INTERAC_HUB_PRIVATE_JWK") ?? Deno.env.get("INTERAC_PRIVATE_JWK");
    if (!raw) {
      return new Response(JSON.stringify({ error: "INTERAC_PRIVATE_JWK not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwk = parseJwk(raw);
    const pub: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(jwk)) {
      if (!PRIVATE_FIELDS.includes(k)) pub[k] = v;
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
