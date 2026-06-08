## Path B — $1 live card top-up test

This will charge a **real $1 CAD** to a real card on the live Stripe account `acct_1T7dSIEJgSLwPPaN`. No refund will be issued automatically — you'd refund from the Stripe dashboard if desired.

## What you do first (in the preview)

1. Sign in as the cardholder you want to test (e.g. **Samson** — `smatibini.sm@gmail.com`, who already has a CAD Visa `••4001` on file as `pm_1TWkPA…`). If you'd rather use a fresh card, sign in as anyone, go to `/cards` → Link a card, complete the Stripe SetupIntent. Tell me when done.
2. Confirm: "go" once you're signed in.

## What I do in build mode

1. Verify auth: hit a tiny authed endpoint with the preview session to confirm `auth.uid()` matches the cardholder.
2. `POST /stripe-charge-saved-card` with:
   ```json
   { "payment_method_id": "<your pm_…>", "amount": 1, "currency": "CAD", "purpose": "test_card_funding" }
   ```
3. Read the response → expect `success: true`, `payment_intent_id: pi_…`, `ledger_journal_id`, `wallet_id`.
4. Verify in DB:
   - `ledger_entries` for that `external_reference=pi_…`: one Dr to Stripe Settlement (CAD), one Cr to Customer Wallet Liability (CAD), both $1.
   - New CAD wallet balance = previous + $1 via `get_wallet_balance`.
   - `notifications` row "Top-up successful".
5. Pull `stripe-charge-saved-card` edge logs and surface the PaymentIntent id.
6. Report a one-row pass/fail with all IDs so you can find the charge in Stripe and refund if you want.

## Out of scope for this run

- Decline cases — can't safely test in live mode without a card known to fail.
- Full `/send` end-to-end (would also trigger a real cross-border payout). If you want that, we'd need to wire a "dry-run" mode into `execute-transfer` first, or accept a real $5 CAD → KES test.

## Confirm to proceed

Reply with:
- which user you're signed in as,
- which `pm_…` to charge (or "use Samson's `pm_1TWkPAEJgSLwPPaN3QtRpH1q`"),
- "go".
