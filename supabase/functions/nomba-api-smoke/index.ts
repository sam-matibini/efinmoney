/**
 * Smoke-test official Nomba API credentials (OAuth + optional tiny checkout create).
 * GET /?checkout=1&amount=100&currency=NGN to also try creating a checkout order.
 */
import {
  createNombaCheckoutOrder,
  getNombaAccessToken,
  getNombaApiConfig,
  getNombaCheckoutApiBase,
  nombaApiConfigured,
} from "../_shared/nomba-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cfg = getNombaApiConfig();
  const url = new URL(req.url);
  const wantCheckout = url.searchParams.get("checkout") === "1";

  const result: Record<string, unknown> = {
    configured: nombaApiConfigured(cfg),
    environment: cfg.environment,
    apiBase: cfg.apiBase,
    checkoutApiBase: getNombaCheckoutApiBase(),
    accountIdPresent: !!cfg.accountId,
    clientIdPresent: !!cfg.clientId,
    clientSecretPresent: !!cfg.clientSecret,
  };

  if (!nombaApiConfigured(cfg)) {
    return new Response(JSON.stringify({
      ...result,
      ok: false,
      error: "Missing NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, or NOMBA_ACCOUNT_ID",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const token = await getNombaAccessToken();
    result.ok = true;
    result.oauth = "ok";
    result.accessTokenPreview = `${token.slice(0, 12)}…`;

    const wantAccounts = url.searchParams.get("accounts") === "1";
    if (wantAccounts) {
      const { nombaApiFetch } = await import("../_shared/nomba-api.ts");
      const paths = [
        "/v1/accounts/details",
        "/v1/accounts/balance",
        "/v1/accounts",
        "/v1/accounts/secondary",
      ];
      const probes: Record<string, unknown> = {};
      for (const path of paths) {
        try {
          const r = await nombaApiFetch(path, { method: "GET" });
          probes[path] = { status: r.status, ok: r.ok, json: r.json };
        } catch (e) {
          probes[path] = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      result.accountProbes = probes;
    }

    if (wantCheckout) {
      const amount = Number(url.searchParams.get("amount") || "100");
      const currency = (url.searchParams.get("currency") || "NGN").toUpperCase();
      const appUrl = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
      const created = await createNombaCheckoutOrder({
        amount: Number.isFinite(amount) && amount > 0 ? amount : 100,
        currency,
        callbackUrl: `${appUrl}/wallet/topup?nomba=1`,
        orderReference: `efm-smoke-${Date.now()}`,
        customerEmail: "sam@efintax.biz",
      });
      result.checkout = created;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    result.ok = false;
    result.oauth = "failed";
    result.error = err instanceof Error ? err.message : String(err);
    result.hint =
      result.error === "Forbidden error" || String(result.error).includes("403")
        ? "Nomba returned Forbidden — confirm these are LIVE keys and ask Nomba to enable production API access (or use sandbox keys + NOMBA_ENV=sandbox)."
        : undefined;
    return new Response(JSON.stringify(result), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
