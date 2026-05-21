import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as StellarSdk from "npm:stellar-sdk@12";
import { getElicateConfig } from "../_shared/elicate.ts";

const HORIZON_MAINNET = "https://horizon.stellar.org";
const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC52ZMRITGWQIPG6HSRX3VE3YIPJWZIGWG2XQ5OQ34C6";

type CheckResult = {
  service: string;
  status: "healthy" | "warning" | "failed";
  message: string;
  details?: Record<string, unknown>;
};

async function checkStellar(): Promise<CheckResult> {
  try {
    const seed = Deno.env.get("STELLAR_TREASURY_SEED");
    if (!seed) return { service: "stellar", status: "failed", message: "STELLAR_TREASURY_SEED not configured" };
    const kp = StellarSdk.Keypair.fromSecret(seed);
    const publicKey = kp.publicKey();

    const r = await fetch(`${HORIZON_MAINNET}/accounts/${publicKey}`);
    if (r.status === 404) {
      return {
        service: "stellar",
        status: "warning",
        message: "Treasury account not yet activated or has 0 XLM.",
        details: { publicKey, network: "mainnet", funded: false },
      };
    }
    if (!r.ok) {
      return { service: "stellar", status: "failed", message: `Horizon error ${r.status}`, details: { publicKey } };
    }
    const acct = await r.json();
    const balances = (acct.balances ?? []) as Array<Record<string, string>>;
    const native = balances.find((b) => b.asset_type === "native");
    const usdc = balances.find(
      (b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER_MAINNET,
    );
    const xlm = Number(native?.balance ?? "0");
    if (xlm === 0) {
      return {
        service: "stellar",
        status: "warning",
        message: "Treasury account not yet activated or has 0 XLM.",
        details: { publicKey, xlm: "0", usdc: usdc?.balance ?? null, hasUsdcTrustline: !!usdc, network: "mainnet" },
      };
    }
    return {
      service: "stellar",
      status: "healthy",
      message: "Treasury account live on Mainnet.",
      details: {
        publicKey,
        xlm: native?.balance ?? "0",
        usdc: usdc?.balance ?? null,
        hasUsdcTrustline: !!usdc,
        network: "mainnet",
      },
    };
  } catch (e) {
    return { service: "stellar", status: "failed", message: (e as Error).message };
  }
}

async function checkElicate(): Promise<CheckResult> {
  try {
    const { mode, url, secretKey } = getElicateConfig();
    if (!secretKey) return { service: "elicate", status: "failed", message: `ELICATE_${mode === "live" ? "LIVE_" : ""}SECRET_KEY not configured`, details: { mode } };
    if (!url) return { service: "elicate", status: "failed", message: "ELICATE_LIVE_BASE_URL not configured", details: { mode } };
    const r = await fetch(url, {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    if (r.status >= 200 && r.status < 500) {
      return {
        service: "elicate",
        status: "healthy",
        message: "Connected Successfully",
        details: { mode, endpoint: host, httpStatus: r.status },
      };
    }
    return { service: "elicate", status: "failed", message: `API Key Invalid / Connection Failed (HTTP ${r.status})`, details: { mode, endpoint: host } };
  } catch (e) {
    return { service: "elicate", status: "failed", message: `Connection Failed: ${(e as Error).message}` };
  }
}

async function checkStripe(): Promise<CheckResult> {
  try {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return { service: "stripe", status: "failed", message: "STRIPE_SECRET_KEY not configured" };
    const r = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json();
    if (!r.ok) {
      return { service: "stripe", status: "failed", message: body?.error?.message || `HTTP ${r.status}` };
    }
    const available = (body.available ?? []).map((b: Record<string, unknown>) => ({
      currency: b.currency,
      amount: Number(b.amount) / 100,
    }));
    return {
      service: "stripe",
      status: "healthy",
      message: "Connected Successfully",
      details: { mode: key.startsWith("sk_live") ? "live" : "test", balances: available },
    };
  } catch (e) {
    return { service: "stripe", status: "failed", message: (e as Error).message };
  }
}

async function checkPaysafe(): Promise<CheckResult> {
  try {
    const apiKey = Deno.env.get("PAYSAFE_API_KEY");
    const env = (Deno.env.get("PAYSAFE_ENV") ?? "test").toLowerCase();
    if (!apiKey) return { service: "paysafe", status: "failed", message: "PAYSAFE_API_KEY not configured" };
    const host = env === "live" || env === "production"
      ? "https://api.paysafe.com"
      : "https://api.test.paysafe.com";
    const r = await fetch(`${host}/paymenthub/v1/monitor`, {
      headers: { Authorization: `Basic ${btoa(apiKey)}` },
    });
    if (r.ok) {
      return {
        service: "paysafe",
        status: "healthy",
        message: "Connected Successfully",
        details: { environment: env },
      };
    }
    return { service: "paysafe", status: "failed", message: `API Key Invalid / Connection Failed (HTTP ${r.status})` };
  } catch (e) {
    return { service: "paysafe", status: "failed", message: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Restrict to admins (either admin_users portal row OR user_roles 'admin')
    const uid = claims.claims.sub;
    const [{ data: adminRow }, { data: roleRow }] = await Promise.all([
      supabase.from("admin_users").select("id").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle(),
    ]);
    if (!adminRow && !roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let target = "all";
    try {
      const body = await req.json();
      target = body?.service ?? "all";
    } catch { /* no body */ }

    const tasks: Array<Promise<CheckResult>> = [];
    if (target === "all" || target === "stellar") tasks.push(checkStellar());
    if (target === "all" || target === "elicate") tasks.push(checkElicate());
    if (target === "all" || target === "stripe") tasks.push(checkStripe());
    if (target === "all" || target === "paysafe") tasks.push(checkPaysafe());

    const results = await Promise.all(tasks);

    return new Response(JSON.stringify({ checked_at: new Date().toISOString(), results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
