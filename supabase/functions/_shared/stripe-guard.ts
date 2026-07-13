import { corsHeaders } from "./cors.ts";

/** Stripe is off unless STRIPE_ENABLED=true is set in edge function secrets. */
export function isStripeEnabled(): boolean {
  return Deno.env.get("STRIPE_ENABLED") === "true";
}

export function stripeDisabledResponse(status = 410): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Stripe payments are disabled on eFin Money.",
      code: "stripe_disabled",
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
