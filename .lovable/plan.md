## Goal
Move Stripe integration from test (`sk_test_` / `pk_test_`) to live (`sk_live_` / `pk_live_`) production keys.

## Steps

### 1. Update Stripe secrets to live keys
Use the secrets tool to update both:
- `STRIPE_SECRET_KEY` → your `sk_live_...` value
- `STRIPE_PUBLISHABLE_KEY` → your `pk_live_...` value

You'll paste the values into a secure form — they're never shown in chat or stored in code. The frontend `src/lib/stripe.ts` and edge functions (`stripe-payment-intent`, `intra-ca-transfer-create`) already read these from the environment, so no client code changes are needed for the swap itself.

### 2. Remove the Stripe test-mode fallback in `intra-ca-transfer-create`
Currently `supabase/functions/intra-ca-transfer-create/index.ts` detects `sk_test_` and substitutes Stripe's documented test bank numbers (institution `001`, transit `11000`, account `000123456789`) instead of the real Plaid-returned EFT numbers. In live mode this branch will never trigger, but it's dead code that's risky to leave around. I'll remove the `isTestMode` block so real Plaid account/institution/transit numbers are always sent to Stripe.

### 3. Pre-flight checks before going live
Before/after switching, please verify in your Stripe Dashboard (live mode):
- **ACSS Debit (PAD)** is activated on your account — required for `/transfers/canada` Plaid + PAD top-ups. This often requires an additional Stripe activation step beyond standard card payments.
- **Card payments (CAD + USD)** are enabled — required for the deposit/Add Funds flow.
- **Webhook endpoints** (if any are configured in test mode) are recreated against the live mode dashboard. Note: the current code uses synchronous `paymentIntents.retrieve` for confirmation rather than webhooks, so this may not apply, but worth confirming.
- Your Stripe account is **fully activated** (business details, bank account for payouts, identity verification all complete).

### 4. Smoke test in production
After the keys are swapped, test with a small real amount:
1. Deposit a small amount via card on the dashboard.
2. Run a small Plaid + PAD top-up on `/transfers/canada`.
3. Confirm ledger entries post correctly and the wallet balance updates.

## Files affected
- `supabase/functions/intra-ca-transfer-create/index.ts` — remove ~6 lines of `isTestMode` test-data substitution.
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (updated via secure form, not committed to code).

## Not changing
- `src/lib/stripe.ts`, `supabase/functions/stripe-payment-intent/index.ts`, and Stripe API version pinning all stay the same — they're already production-ready and key-agnostic.
