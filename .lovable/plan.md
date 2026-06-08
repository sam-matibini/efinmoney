## Goal
Make the Canada domestic transfer flow usable for Stripe Connect self-payout testing so the Stripe Connect option becomes selectable when your connected account exists, refreshes status correctly, and routes through the instant payout path with clear failure reasons.

## Plan
1. Fix backend access for connected-account reads and status sync
   - Add the missing backend table grants for `stripe_connected_accounts` so signed-in users can actually read their own row from the app.
   - Add the missing update policy so the authenticated refresh path can safely persist status changes when needed.
   - Verify the table remains private to each user.

2. Harden Stripe Connect status refresh
   - Update `stripe-connect-refresh-status` to classify readiness more reliably from Stripe account data.
   - Return a clearer payload for the UI, including whether the connected account exists, whether payouts are ready, and any pending requirements.
   - Make sure the function surfaces actionable errors instead of silently falling back to `pending`.

3. Relax the Canada send-flow gating
   - Stop hard-disabling the Stripe Connect option just because the cached status is not yet `active`.
   - Allow selection when a connected account row exists, then refresh/validate before submission.
   - Keep submission blocked only when the latest refresh says payouts still are not ready, and show the exact reason inline.

4. Improve the Stripe Connect setup page
   - Refresh account status automatically after onboarding exit and on page load.
   - Show the latest readiness state and pending items more clearly.
   - Keep a manual refresh action for test accounts that were activated outside the current session.

5. Validate the transfer route end to end
   - Confirm `execute-transfer` still routes `payout_method = stripe_connect` to `stripe-connect-instant-payout`.
   - Verify the payout function returns clear errors for missing external account, payouts not enabled, or insufficient platform balance.
   - Retest the self-transfer flow with wallet funding and card funding preserved.

## Technical details
- Files likely touched:
  - `src/components/send/CanadaSendFlow.tsx`
  - `src/hooks/useStripeConnectedAccount.tsx`
  - `src/pages/StripeConnectInstantPage.tsx`
  - `supabase/functions/stripe-connect-refresh-status/index.ts`
  - a database migration for `stripe_connected_accounts`
- Confirmed issue from backend inspection:
  - `stripe_connected_accounts` currently has policies but no table grants exposed to the app.
  - Current policies only cover view + insert; there is no update policy.
- No schema redesign is needed; this is a permissions + readiness + gating fix.