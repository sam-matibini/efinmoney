/**
 * Smoke-test official Nomba API credentials (OAuth + optional tiny checkout create).
 * GET /?checkout=1&amount=100&currency=NGN to also try creating a checkout order.
 */
import {
  createNombaCheckoutOrder,
  getNombaAccessToken,
  getNombaApiConfig,
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
