# Save Stripe Pay-In Webhook Secret

## 1. Request the secret
Use the secrets tool to securely store `STRIPE_PAYIN_WEBHOOK_SECRET` (the `whsec_...` value from the Stripe Dashboard webhook you just created pointing at `/functions/v1/stripe-payin-webhook`).

This is the only secret needed — `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (Checkout/general), `STRIPE_PAYOUT_WEBHOOK_SECRET`, and `STRIPE_ISSUING_WEBHOOK_SECRET` are already configured.

## 2. Update Stripe settings panel
In `src/components/settings/integrations/StripeConfig.tsx`, enhance the "International Pay-In (Stripe Checkout)" card:
- Add a small status row showing which Stripe secrets are configured (✓ Secret key, ✓ Publishable key, ✓ Pay-in webhook secret, ✓ Payout webhook secret, ✓ Issuing webhook secret).
- The status is read from a tiny edge function (or inline fetch) that returns `{ hasPayinWebhook: boolean, ... }` based on `Deno.env` presence — never expose values.
- Add a "Test webhook" hint linking to Stripe Dashboard → Webhooks → Send test event for `checkout.session.completed`.

## 3. Verify end-to-end
- Confirm `supabase/functions/stripe-payin-webhook/index.ts` reads `STRIPE_PAYIN_WEBHOOK_SECRET` (already wired from the earlier step).
- After the secret is saved, the function will auto-redeploy and start verifying signatures.

No DB migrations, no new pages.