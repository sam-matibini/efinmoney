import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TestResult = { ok: boolean; message: string; detail?: string };

async function testStripe(): Promise<TestResult> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return { ok: false, message: "STRIPE_SECRET_KEY not configured" };
  const r = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.ok) return { ok: true, message: "Stripe connected — balance endpoint reachable" };
  const body = await r.text();
  return { ok: false, message: `Stripe error ${r.status}`, detail: body.slice(0, 200) };
}

async function testPaysafe(): Promise<TestResult> {
  const key = Deno.env.get("PAYSAFE_API_KEY");
  if (!key) return { ok: false, message: "PAYSAFE_API_KEY not configured" };
  const r = await fetch("https://api.paysafe.com/accountmanagement/v1/accounts", {
    headers: { Authorization: `Basic ${btoa(key + ":")}` },
  });
  if (r.status < 500) return { ok: true, message: `Paysafe reachable (HTTP ${r.status})` };
  return { ok: false, message: `Paysafe returned ${r.status}` };
}

async function testPlaid(): Promise<TestResult> {
  const clientId = Deno.env.get("PLAID_CLIENT_ID");
  const secret = Deno.env.get("PLAID_SECRET");
  if (!clientId || !secret) return { ok: false, message: "PLAID_CLIENT_ID / PLAID_SECRET not configured" };
  const r = await fetch("https://production.plaid.com/institutions/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, count: 1, offset: 0, country_codes: ["CA"] }),
  });
  if (r.ok) return { ok: true, message: "Plaid connected — institutions endpoint reachable" };
  const body = await r.text();
  return { ok: false, message: `Plaid error ${r.status}`, detail: body.slice(0, 200) };
}

async function testPersona(): Promise<TestResult> {
  const key = Deno.env.get("PERSONA_API_KEY");
  if (!key) return { ok: false, message: "PERSONA_API_KEY not configured" };
  const r = await fetch("https://withpersona.com/api/v1/accounts?page[size]=1", {
    headers: { Authorization: `Bearer ${key}`, "Persona-Version": "2023-01-05" },
  });
  if (r.ok) return { ok: true, message: "Persona connected" };
  return { ok: false, message: `Persona error ${r.status}` };
}

async function testMpesa(): Promise<TestResult> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) {
    return { ok: false, message: "MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET not configured" };
  }
  const r = await fetch(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` } }
  );
  if (r.ok) return { ok: true, message: "M-Pesa connected — OAuth token reachable" };
  return { ok: false, message: `M-Pesa OAuth error ${r.status}` };
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
    { global: { headers: { Authorization: authHeader } } }
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
    switch (provider) {
      case "stripe":  result = await testStripe();  break;
      case "paysafe": result = await testPaysafe(); break;
      case "plaid":   result = await testPlaid();   break;
      case "persona": result = await testPersona(); break;
      case "mpesa":   result = await testMpesa();   break;
      default: result = { ok: false, message: `Unknown provider: ${provider}` };
    }
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
