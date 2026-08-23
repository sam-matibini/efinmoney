/**
 * Public Bambora config for Custom Checkout (merchant id + capability flags).
 */
import { getBamboraConfig } from "../_shared/bambora.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cfg = getBamboraConfig();
  const ready = Boolean(cfg.merchantId && cfg.paymentsPasscode);
  return new Response(
    JSON.stringify({
      ok: ready,
      ready,
      merchant_id: cfg.merchantId || null,
      currency: cfg.currency || "CAD",
      currencies: ["CAD", "USD"],
      profiles: Boolean(cfg.profilesPasscode),
      eft_batch: Boolean(cfg.batchPasscode),
      custom_checkout_js: "https://libs.na.bambora.com/customcheckout/1/customcheckout.js",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
