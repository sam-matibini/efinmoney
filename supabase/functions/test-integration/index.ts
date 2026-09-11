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

async function testPayPal(): Promise<TestResult> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
  const live = (Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox").trim().toLowerCase() === "live";
  const host = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const r = await fetch(`${host}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (r.ok) return { ok: true, message: `Connected — PayPal OAuth reachable (${live ? "live" : "sandbox"})` };
  return { ok: false, message: `PayPal OAuth error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testSquare(): Promise<TestResult> {
  const token = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
  const sandbox = (Deno.env.get("SQUARE_ENVIRONMENT") || "production").trim().toLowerCase() === "sandbox";
  const host = sandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const r = await fetch(`${host}/v2/locations`, {
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2025-01-23" },
  });
  if (r.ok) return { ok: true, message: "Connected — Square locations endpoint reachable" };
  return { ok: false, message: `Square error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testFlovide(): Promise<TestResult> {
  const pk = Deno.env.get("FLOVIDE_PUBLIC_KEY")!;
  const sk = Deno.env.get("FLOVIDE_SECRET_KEY")!;
  const base = (Deno.env.get("FLOVIDE_API_BASE") || "https://flovide.com").replace(/\/+$/, "");
  const r = await fetch(`${base}/api/v1/reference-data/currencies`, {
    headers: { Accept: "application/json", "X-Public-Key": pk, "X-Secret-Key": sk },
  });
  if (r.ok) return { ok: true, message: "Connected — Flovide currencies endpoint reachable" };
  return { ok: false, message: `Flovide error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

async function testFincra(): Promise<TestResult> {
  const key = Deno.env.get("FINCRA_SECRET_KEY")!;
  const envRaw = (Deno.env.get("FINCRA_ENV") ?? "sandbox").trim().toLowerCase();
  const isLive = ["live", "production", "prod", "1", "true"].includes(envRaw);
  const host = isLive ? "https://api.fincra.com" : "https://sandboxapi.fincra.com";
  const r = await fetch(`${host}/profile`, {
    headers: { Accept: "application/json", "api-key": key },
  });
  if (r.status === 401 || r.status === 403) {
    return { ok: false, message: `Fincra auth failed (HTTP ${r.status})`, detail: (await r.text()).slice(0, 200) };
  }
  if (r.status < 500) return { ok: true, message: `Connected — Fincra reachable (HTTP ${r.status})` };
  return { ok: false, message: `Fincra error ${r.status}` };
}

async function testVerto(): Promise<TestResult> {
  const clientId = Deno.env.get("VERTO_CLIENT_ID")!;
  const apiKey = Deno.env.get("VERTO_API_KEY")!;
  const env = (Deno.env.get("VERTO_ENV") || "sandbox").trim().toLowerCase();
  const live = ["live", "production", "prod", "beta"].includes(env);
  const host = live ? "https://api-company-beta.vertofx.com" : "https://api-company-sandbox.vertofx.com";
  const r = await fetch(`${host}/users/login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ clientId, apiKey, mode: "apiKey" }),
  });
  if (r.ok) return { ok: true, message: `Connected — Verto login reachable (${live ? "production" : "sandbox"})` };
  return { ok: false, message: `Verto login error ${r.status}`, detail: (await r.text()).slice(0, 200) };
}

// ── Provider registry: required env vars (+ optional live probe) ─────────────
// A provider with no `live` probe reports "configured" when its secrets are
// present — an honest signal (missing credentials is the #1 cause of a dead
// integration) without a fragile bespoke API handshake.
const PROVIDERS: Record<string, { required: string[]; live?: () => Promise<TestResult> }> = {
  // Payments — Africa
  nomba:       { required: ["NOMBA_PAY_API_URL", "NOMBA_PAY_USER"] },
  ghana:       { required: ["GHANA_PAY_API_URL", "GHANA_PAY_USER"] },
  fincra:      { required: ["FINCRA_SECRET_KEY", "FINCRA_BUSINESS_ID"], live: testFincra },
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
  paypal:      { required: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], live: testPayPal },
  square:      { required: ["SQUARE_ACCESS_TOKEN", "SQUARE_APPLICATION_ID", "SQUARE_LOCATION_ID"], live: testSquare },
  flovide:     { required: ["FLOVIDE_PUBLIC_KEY", "FLOVIDE_SECRET_KEY"], live: testFlovide },
  dodo:        { required: ["DODO_PAYMENTS_API_KEY"] },
  wise:        { required: ["WISE_API_TOKEN"] },
  verto:       { required: ["VERTO_CLIENT_ID", "VERTO_API_KEY"], live: testVerto },
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
