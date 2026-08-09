# Interac e-Transfer pay-in: Square-style checkout, EFM intents, auto reconciliation

Scope for this plan: the customer-facing checkout, the payment-intent model with proper statuses and EFM references, and the automatic reconciliation of Wise CAD deposits. Merchant API, signed merchant webhooks, admin Interac dashboard, exceptions queue UI and GL postings are deliberately out of scope for now and can follow in later passes.

The same intent model serves both cases: an eFinMoney user funding their own wallet/transfer (`purpose = topup | transfer`) and a merchant collecting from a customer (`purpose = merchant_collection`, carrying merchant and customer identity).

## What the customer sees

**Step 1 — method selection (Square-style).** A single method grid instead of today's tab strip: card brands (Visa / Mastercard / Amex) in one row, wallets (Apple Pay / Google Pay) in the next, then a full-width Interac e-Transfer card — "Pay securely from your Canadian bank account" — as a first-class option, not a bank-instruction footnote. Amount shown at the top, one `Continue` button. Interac only appears when the collection currency is CAD.

**Step 2 — Interac identity.** A focused panel asking for the email address or mobile number the customer uses with Interac, plus their name (prefilled for signed-in users). Accepts either an email or a Canadian mobile number; validates one of the two is present.

**Step 3 — payment instructions.** Amount, the Wise autodeposit alias, the EFM reference, separate `Copy email` / `Copy reference` buttons (and a combined "Copy payment details"), plus the note that the payment is matched and confirmed automatically. An `I've sent the payment` button records the customer's claim and moves the intent to `awaiting_payment` — it never marks the payment as paid. The panel then polls and shows `Waiting for your Interac transfer…` until reconciliation confirms.

## Statuses

Intent status becomes an explicit lifecycle: `pending` → `awaiting_payment` → `received` → `matched` → `confirmed` → `settled`, plus terminal `expired`, `unmatched`, `refunded`, `cancelled`. Existing rows map: current `pending` stays `pending`, `credited` becomes `settled`, `expired`/`cancelled` unchanged. The UI shows friendly copy per status; only `settled` (wallet credited / transfer released) counts as complete.

## Reference format

References switch to `EFM-YYYYMMDD-00000000` — a date plus an 8-digit sequence from a Postgres sequence — and the same string is the customer-visible payment reference and the intent's public id. The old `efm-interac-…` pattern keeps working in the matcher so intents already in flight still reconcile.

## Reconciliation

`wise-webhook` gains a three-tier matcher for CAD credits, run in order and only against non-terminal intents:

1. Reference + amount + currency (exact) → auto-confirm.
2. Amount + currency + sender email/phone match → auto-confirm.
3. Amount + currency inside the intent's validity window → auto-confirm **only if exactly one candidate**.

If a tier yields more than one candidate, nothing is allocated: the deposit is recorded as `unmatched` with the Wise transaction details and an operations alert is raised for manual allocation. On a confirmed match the wallet is credited exactly as today (idempotent on the Wise transaction id), the intent moves `matched` → `confirmed` → `settled`, and for `purpose = transfer` the linked payout is executed automatically.

Duplicate protection: credits are keyed on the Wise transaction/idempotency key so a redelivered webhook cannot double-credit.

## Technical changes

**Migration** on `fincra_cad_interac_intents`:
- `public_id text unique` (the `EFM-YYYYMMDD-00000000` value) with a `interac_intent_seq` sequence and a generator function; `reference` gets the same value.
- widen `purpose` to allow `merchant_collection`; add `merchant_id uuid`, `customer_name text`, `customer_email text`, `customer_phone text`, `sender_phone text`.
- `claimed_sent_at timestamptz`, `received_at timestamptz`, `matched_at timestamptz`, `confirmed_at timestamptz`, `match_tier text`, `wise_transaction_id text`, `unmatched_reason text`.
- status check constraint replaced with the lifecycle list above; backfill `credited` → `settled`.
- indexes on `status`, `amount`, `sender_email`, `wise_transaction_id`.
- grants unchanged (`authenticated` read/write own rows via existing RLS, `service_role` all).

**Edge function `fincra-cad-interac`**: generate the new reference via the DB function; accept `sender_phone`, optional merchant/customer fields, and `purpose = merchant_collection`; new `claim_sent` action that stamps `claimed_sent_at` and sets `awaiting_payment`; return `public_id`, `alias`, `reference`, `expires_at`, and the instruction list.

**Edge function `wise-webhook`**: replace the single reference lookup with the tiered matcher described above, write the match metadata onto the intent, keep the existing credit + `execute-transfer` path, and raise an operations alert (existing `compliance_alerts`/notification path used for unmatched Wise credits) on ambiguity or no match.

**Frontend**:
- New `src/components/payments/InteracMethodCard.tsx` — the first-class Interac option tile.
- New `src/components/payments/CheckoutMethodGrid.tsx` — Square-style card-brand / wallet / Interac grid, used by the CAD collection panel.
- `src/components/payments/InteracCheckout.tsx` — split into the identity step (email or mobile) and the instructions step; add `Copy email`, `Copy reference`, `Copy payment details`, `I've sent the payment` (calls `claim_sent`), and status-aware waiting copy.
- `src/components/topup/CadCollectionPanel.tsx` — render the method grid and route Interac selection into the new two-step checkout.
- `src/components/send/MethodCheckoutPanel.tsx` — reuse the same Interac steps for `funding = interac`.

## Notes

- Interac is a push rail. Wise cannot pull funds, so the customer always initiates from their bank app; the reference and the tiered matcher are what link the deposit to the intent.
- No new secrets: the existing Wise receive-option lookup with the `WISE_CAD_INTERAC_ALIAS` fallback stays as the deposit alias source.
- Before production, confirm with Wise that the business/PSP use of Interac Autodeposit on the receiving CAD account is permitted; the app behaviour does not change either way.
