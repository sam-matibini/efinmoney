/**
 * Public Square Web Payments config (application + location IDs only — never the access token).
 * GET/POST → { applicationId, locationId, environment }
 */
import { getSquareConfig, squareConfigured } from "../_shared/square.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cfg = getSquareConfig();
  if (!squareConfigured(cfg)) {
    return new Response(JSON.stringify({
      configured: false,
      error: "Square is not configured (need SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID)",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    configured: true,
    applicationId: cfg.applicationId,
    locationId: cfg.locationId,
    environment: cfg.environment,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
