## Card-funded transfer is already wired — here's the test

No code changes. We'll run the end-to-end flow in the live preview using Stripe **test card numbers**, then verify the edge function logs and DB rows.

## Flow under test

```
SendPage → "Pay with card" → stripe-charge-saved-card (PaymentIntent on platform acct)
        → success → INSERT transfers (funding_source='card', bypasses wallet check)
        → execute-transfer (prefunded=true) → Flutterwave/PawaPay/Stripe Connect payout
```

The "Stripe Connect" leg is the **payout** side (`stripe-connect-instant-payout` / Visa Direct), not the charge side. Funding the sender always hits the platform Stripe account.

## Prereqs to confirm before testing

- A saved card exists on `/cards` (Linked Cards section). If none, link one first using Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
- `STRIPE_SECRET_KEY` is set (it is — confirmed in secrets).
- Sender is signed in and KYC tier allows the chosen corridor.

## Test cases

| # | Card (test) | Expected |
|---|---|---|
| 1 | `4242 4242 4242 4242` | charge succeeds, transfer created with `funding_source='card'`, payout queued |
| 2 | `4000 0000 0000 9995` | decline `insufficient_funds`, friendly toast, **no** transfer row created |
| 3 | `4000 0000 0000 0002` | generic `card_declined`, no transfer row |
| 4 | `4000 0025 0000 3155` | 3DS challenge — should surface authentication_required (current flow rejects; expected) |

## Verification after each run

1. **Toast** — success or specific friendly decline message.
2. **`transfers` table** — for case 1: row with `funding_source='card'`, `provider_charge_id` (or `payment_intent_id` in metadata) populated, `status` progressing `pending → processing → completed`.
3. **`stripe-charge-saved-card` logs** — PaymentIntent id + status.
4. **`execute-transfer` logs** — `prefunded: true` honored, payout provider response.
5. **`ledger_entries`** — on completion, debit clearing account / credit recipient float; no debit to sender wallet (since funded by card).

## What I'll do in build mode

1. Hit `/send` in the preview, pick a Canadian → corridor recipient, choose **Pay with card**, run case 1.
2. Pull `stripe-charge-saved-card` and `execute-transfer` logs.
3. Query the `transfers` and `ledger_entries` rows for the new transfer id.
4. Repeat for case 2 (decline) and confirm no transfer row is written.
5. Report a pass/fail table with the IDs.

## Open question

Should I run this as **your logged-in preview session** (uses whatever recipient/corridor is convenient) or do you want a specific corridor + amount + recipient name to target? Default: smallest valid amount, Canada → Kenya (PawaPay), $5 CAD.
