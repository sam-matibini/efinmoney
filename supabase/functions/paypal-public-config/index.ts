/**
 * Public PayPal config for the browser (Client ID only — never the secret).
 */
import { getPayPalConfig, paypalConfigured } from "../_shared/paypal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cfg = getPayPalConfig();
  if (!paypalConfigured(cfg)) {
    return new Response(JSON.stringify({
      configured: false,
      error: "PayPal is not configured (need PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    configured: true,
    clientId: cfg.clientId,
    environment: cfg.environment,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
