# Fix: Stripe Connect tile stays disabled after onboarding

## Root cause
Two issues stack:

1. **DB never gets updated after onboarding.** `stripe_connected_accounts.status` is inserted as `'pending'` by `stripe-connect-create-account` and is never refreshed. The `/stripe-connect` page's `ConnectAccountOnboarding.onExit` only flips a local `onboarded` flag — it doesn't write back to Supabase. So the row stays `status='pending'` forever (and right now the table is even empty for the current user — the row may have been wiped or was never persisted on this env).
2. **Gating is strict.** `CanadaSendFlow` disables the Stripe Connect tile whenever `isConnectReady(connectAcct)` is false, which requires `status === 'active'`. With (1) always pending, the tile is always disabled — exactly what the screenshot shows.

## Fix

### New edge function: `supabase/functions/stripe-connect-refresh-status/index.ts`
- Auth: standard user JWT (no internal secret).
- Look up the caller's row in `stripe_connected_accounts`.
- If missing, return `{ exists: false }`.
- Otherwise `GET https://api.stripe.com/v2/core/accounts/{id}` with `Stripe-Version: 2025-03-31.preview` (same version `create-account` uses).
- Derive readiness from the v2 response: account is "active" when `configuration.recipient.capabilities.payouts.status === 'active'` (fallback to `requirements.currently_due` being empty + `merchant.capabilities.card_payments.status === 'active'` for v1-shape responses).
- Update the row: `status` ← `'active'` or `'pending'`, plus refreshed `capabilities`, `requirements`, `raw`.
- Return the updated row.

### `src/pages/StripeConnectInstantPage.tsx`
- After `ConnectAccountOnboarding.onExit`, invoke `stripe-connect-refresh-status` and update local `account` state.
- Also call it once on mount when a row already exists, so returning users see fresh status.
- Add a small "Refresh status" button next to the account header for manual re-sync.

### `src/hooks/useStripeConnectedAccount.tsx`
- Add a `refresh()` helper that invokes `stripe-connect-refresh-status` then invalidates the query.
- Export it alongside the existing return.
- Keep `isConnectReady` logic but widen the v2 capability check to also accept `configuration.recipient.capabilities.payouts.status === 'active'`.

### `src/components/send/CanadaSendFlow.tsx`
- On mount of the delivery section, if a row exists but `!connectReady`, call `refresh()` once so a stale `pending` row self-heals without forcing the user back to `/stripe-connect`.
- Update the disabled-state helper text to: "If you've just finished onboarding, tap to refresh status" with a small inline refresh action when a row exists but isn't active yet.

## Out of scope
- No change to `stripe-connect-create-account`, `stripe-connect-instant-payout`, or the webhook.
- No DB schema change (status/capabilities/requirements columns already exist).
- No change to other delivery methods or to the `/stripe-connect` v2 onboarding component.

## Test path
1. `/stripe-connect` → finish onboarding → page auto-refreshes → header shows `status: active`.
2. `/send` → Canada Domestic → Stripe Connect tile is now enabled (or self-heals on mount if it lagged).
3. Submit a small CAD test transfer → existing `stripe-connect-instant-payout` flow runs unchanged.
