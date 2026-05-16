// SEP-1 stellar.toml discovery.
// Given an anchor home domain, fetch its stellar.toml and extract the
// endpoints/signing key our SEP-31 bridge needs.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  domain: z.string().min(3).max(253),
});

// Tiny TOML key extractor — we only need a handful of top-level string keys
// from stellar.toml so we avoid pulling a full TOML parser.
function extractKey(toml: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "mi");
  const m = toml.match(re);
  return m ? m[1] : null;
}

async function fetchToml(domain: string): Promise<string> {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = `https://${clean}/.well-known/stellar.toml`;
  const res = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`stellar.toml fetch failed: ${res.status}`);
  return await res.text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const toml = await fetchToml(parsed.data.domain);

    const info = {
      domain: parsed.data.domain,
      signing_key: extractKey(toml, "SIGNING_KEY"),
      network_passphrase: extractKey(toml, "NETWORK_PASSPHRASE"),
      horizon_url: extractKey(toml, "HORIZON_URL"),
      web_auth_endpoint: extractKey(toml, "WEB_AUTH_ENDPOINT"),
      direct_payment_server: extractKey(toml, "DIRECT_PAYMENT_SERVER"),
      transfer_server_sep0024: extractKey(toml, "TRANSFER_SERVER_SEP0024"),
      kyc_server: extractKey(toml, "KYC_SERVER"),
    };

    if (!info.direct_payment_server || !info.web_auth_endpoint || !info.signing_key) {
      return new Response(JSON.stringify({
        error: "Anchor stellar.toml missing SEP-31 endpoints",
        info,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, ...info }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("stellar-anchor-discovery error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
