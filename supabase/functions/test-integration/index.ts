import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TestResult = { ok: boolean; message: string; detail?: string };

const has = (name: string) => {
  const v = Deno.env.get(name);
  return typeof v === "string" && v.trim().length > 0;
};

// ── Live connectivity probes (only where a safe read-only call exists) ───────
async function testStripe(): Promise<TestResult> {
  const key = Deno.env.get("STRIPE_SECRET_KEY")!;
  const r = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.ok) return { ok: true, message: "Connected — Stripe balance endpoint reachable" };
  return { ok: false, message: `Stripe error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testPaysafe(): Promise<TestResult> {
  const key = Deno.env.get("PAYSAFE_API_KEY")!;
  const r = await fetch("https://api.paysafe.com/accountmanagement/v1/accounts", {
    headers: { Authorization: `Basic ${btoa(key + ":")}` },
  });
  if (r.status < 500) return { ok: true, message: `Connected — Paysafe reachable (HTTP ${r.status})` };
  return { ok: false, message: `Paysafe returned ${r.status}` };
}

async function testPlaid(): Promise<TestResult> {
  const clientId = Deno.env.get("PLAID_CLIENT_ID")!;
  const secret = Deno.env.get("PLAID_SECRET")!;
  const host = (Deno.env.get("PLAID_ENV") || "production") === "sandbox"
    ? "https://sandbox.plaid.com"
    : "https://production.plaid.com";
  const r = await fetch(`${host}/institutions/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, count: 1, offset: 0, country_codes: ["CA"] }),
  });
  if (r.ok) return { ok: true, message: "Connected — Plaid institutions endpoint reachable" };
  return { ok: false, message: `Plaid error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testPersona(): Promise<TestResult> {
  const key = Deno.env.get("PERSONA_API_KEY")!;
  const r = await fetch("https://withpersona.com/api/v1/accounts?page[size]=1", {
    headers: { Authorization: `Bearer ${key}`, "Persona-Version": "2023-01-05" },
  });
  if (r.ok) return { ok: true, message: "Connected — Persona reachable" };
  return { ok: false, message: `Persona error ${r.status}` };
}

async function testMpesa(): Promise<TestResult> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY")!;
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
  const r = await fetch(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` } },
  );
  if (r.ok) return { ok: true, message: "Connected — M-Pesa OAuth token reachable" };
  return { ok: false, message: `M-Pesa OAuth error ${r.status}` };
}

async function testFlutterwave(): Promise<TestResult> {
  const key = Deno.env.get("FLW_SECRET_KEY")!;
  const r = await fetch("https://api.flutterwave.com/v3/banks/NG", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.ok) return { ok: true, message: "Connected — Flutterwave bank list reachable" };
  return { ok: false, message: `Flutterwave error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testCircle(): Promise<TestResult> {
  const key = Deno.env.get("CIRCLE_API_KEY")!;
  const host = (Deno.env.get("CIRCLE_ENV") || "production") === "sandbox"
    ? "https://api-sandbox.circle.com"
    : "https://api.circle.com";
  const r = await fetch(`${host}/v1/configuration`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.ok) return { ok: true, message: "Connected — Circle configuration reachable" };
  return { ok: false, message: `Circle error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testResend(): Promise<TestResult> {
  const key = Deno.env.get("RESEND_API_KEY")!;
  const r = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.ok) return { ok: true, message: "Connected — Resend domains endpoint reachable" };
  return { ok: false, message: `Resend error ${r.status}` };
}

// ── Provider registry: required env vars (+ optional live probe) ─────────────
// A provider with no `live` probe reports "configured" when its secrets are
// present — an honest signal (missing credentials is the #1 cause of a dead
// integration) without a fragile bespoke API handshake.
const PROVIDERS: Record<string, { required: string[]; live?: () => Promise<TestResult> }> = {
  // Payments — Africa
  nomba:       { required: ["NOMBA_PAY_API_URL", "NOMBA_PAY_USER"] },
  ghana:       { required: ["GHANA_PAY_API_URL", "GHANA_PAY_USER"] },
  fincra:      { required: ["FINCRA_SECRET_KEY", "FINCRA_BUSINESS_ID"] },
  flutterwave: { required: ["FLW_SECRET_KEY"], live: testFlutterwave },
  swychr:      { required: ["SWYCHR_EMAIL", "SWYCHR_PASSWORD"] },
  elicate:     { required: ["ELICATE_SECRET_KEY"] },
  paytota:     { required: ["PAYTOTA_SECRET_KEY", "PAYTOTA_BASE_URL"] },
  lenhub:      { required: ["LENHUB_FLUTTER_API_KEY", "LENHUB_FLUTTER_USER_KEY"] },
  mtn_momo:    { required: ["MTN_MOMO_PRIMARY_KEY"] },
  mpesa:       { required: ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET"], live: testMpesa },
  pawapay:     { required: ["PAWAPAY_API_TOKEN"] },
  yellowcard:  { required: ["YELLOWCARD_API_KEY", "YELLOWCARD_SECRET"] },
  // Payments — Global / Cards
  stripe:      { required: ["STRIPE_SECRET_KEY"], live: testStripe },
  adyen:       { required: ["ADYEN_API_KEY", "ADYEN_MERCHANT_ACCOUNT"] },
  paysafe:     { required: ["PAYSAFE_API_KEY"], live: testPaysafe },
  // Banking
  plaid:       { required: ["PLAID_CLIENT_ID", "PLAID_SECRET"], live: testPlaid },
  interac:     { required: ["INTERAC_CLIENT_ID", "INTERAC_PRIVATE_JWK"] },
  // Crypto & stablecoin
  circle:      { required: ["CIRCLE_API_KEY"], live: testCircle },
  crossmint:   { required: ["CROSSMINT_API_KEY"] },
  stellar:     { required: ["STELLAR_TREASURY_SEED"] },
  // KYC & compliance
  persona:     { required: ["PERSONA_API_KEY"], live: testPersona },
  sumsub:      { required: ["SUMSUB_APP_TOKEN", "SUMSUB_SECRET_KEY"] },
  // Messaging
  resend:      { required: ["RESEND_API_KEY"], live: testResend },
};

async function testProvider(provider: string): Promise<TestResult> {
  const spec = PROVIDERS[provider];
  if (!spec) return { ok: false, message: `Unknown provider: ${provider}` };

  const missing = spec.required.filter((name) => !has(name));
  if (missing.length > 0) {
    return { ok: false, message: `Not configured — missing ${missing.join(", ")}` };
  }
  if (spec.live) return await spec.live();
  return {
    ok: true,
    message: `Credentials configured (${spec.required.length} secret${spec.required.length > 1 ? "s" : ""} present)`,
    detail: "No live probe available for this provider — verify via a live transaction.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { provider } = await req.json() as { provider: string };

  let result: TestResult;
  try {
    result = await testProvider(provider);
  } catch (e) {
    result = {
      ok: false,
      message: "Connection error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
