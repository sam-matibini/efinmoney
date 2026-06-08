Add a one-click check that confirms whether the configured Stripe key is in Live or Test mode.

## What to build

1. **New edge function `stripe-mode-check`** (admin-only)
   - Calls Stripe `GET /v1/account` with `STRIPE_SECRET_KEY`
   - Returns: `{ mode: "live" | "test", accountId, country, chargesEnabled, payoutsEnabled, capabilities }`
   - Derives mode from `sk_live_` vs `sk_test_` prefix and cross-checks with the `livemode` flag on the response
   - Requires authenticated admin (reuses `has_role` check pattern from other admin functions)

2. **UI: extend `StripeConfig.tsx`**
   - Add a "Mode & Account" card above "Backend Secrets Status"
   - Shows a prominent badge: green "LIVE MODE" or amber "TEST MODE"
   - Shows real account ID, country, charges/payouts enabled, and key capabilities (card_payments, transfers, card_issuing)
   - "Re-check" button to re-invoke
   - Replace the hardcoded `acct_1234567890` / fake "Last Sync" / fake API version block with real values from this call
   - Replace the hardcoded `pk_live_51ABC...xyz` / `sk_live_51ABC...xyz` placeholder inputs with masked real values (first 8 chars + `…` + last 4) returned from the function (publishable only; never return the secret key value itself — just its prefix `sk_live` / `sk_test`)

## Scope guardrails
- No DB changes
- No changes to other Stripe functions
- Diagnostic is read-only; no writes to Stripe

## Files touched
- `supabase/functions/stripe-mode-check/index.ts` (new)
- `src/components/settings/integrations/StripeConfig.tsx` (edit: add card, wire invoke, replace hardcoded values)
