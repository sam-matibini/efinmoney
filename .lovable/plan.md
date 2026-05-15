## Goal

Restructure the Canada send flow so Step 2 collects the **sender's** card (used to fund the transfer), and the recipient is always paid out via **Interac e-Transfer** or **EFT** — never via push-to-card. This removes the recipient-card model entirely from this flow.

## New flow

```
Step 1: Amount + Delivery method (how recipient receives)
        - Interac e-Transfer (C$0.50)
        - Bank Transfer / EFT (free)

Step 2: Funding source (how sender pays)
        - Pay from CAD wallet  (current default)
        - Pay with my debit/credit card  (Stripe charge, +C$1.50 processing fee)
        + Recipient details for chosen delivery method
          (email for Interac, or institution/transit/account for EFT)

Step 3: Confirmation / receipt (unchanged)
```

The "Debit card · Instant" tile is removed from Step 1. Card becomes a **funding option in Step 2**, not a delivery method.

## Code changes

### `src/components/send/CanadaSendFlow.tsx` (main refactor)
- Rename `Method` to `DeliveryMethod` and drop `card_push`: `type DeliveryMethod = "interac" | "eft"`.
- Add new state: `fundingSource: "wallet" | "card"`, default `"wallet"`.
- Step 1 grid goes from 3 tiles to 2 (Interac, EFT). Remove the card_push tile and its hint copy.
- Fee model: keep delivery fee (`interac: 0.50`, `eft: 0`). Add separate `cardProcessingFee = 1.50` applied only when `fundingSource === "card"`. Display both lines in the Summary box.
- Step 2 layout becomes:
  1. **Recipient Full Name**
  2. Recipient delivery details (email for Interac; institution/transit/account for EFT) — same fields as today
  3. **Funding source** segmented control: "Wallet" | "Debit / Credit Card"
  4. If `card` selected: render the existing Stripe `<CardNumberElement>` / `<CardExpiryElement>` / `<CardCvcElement>` block, labeled **"Your card details"**, with helper text "Charged for C$X.XX. We never store your card number."
- Update `isStep2Valid`: must have valid recipient details for the chosen delivery method, AND if funding=card, all three Stripe elements complete.
- Submit button label: `"Send C$X.XX via Interac"` / `"Send C$X.XX via Bank Transfer"` (delivery method, not funding).

### `handleSubmit`
- If `fundingSource === "card"`: tokenize the **sender's** card via Stripe Elements (same `tokenizeDebitCard` helper, just semantically the sender now). Pass `{ name: senderProfileName, currency: "cad" }`.
- Create the `transfers` row with `payout_method = method` (interac/eft) — never `card_push` anymore.
- Pass new fields to `execute-transfer`: `funding_source`, and when card: `funding_card_token`, `funding_last4`, `funding_brand`, plus the `cardProcessingFee` so it's posted as a separate fee on the ledger.

### `supabase/functions/execute-transfer/index.ts`
- Read `funding_source` from request body. Default `"wallet"` for back-compat.
- If `funding_source === "wallet"`: behavior unchanged (debit sender wallet, credit payable, post fee revenue).
- If `funding_source === "card"`:
  - Skip the wallet debit. Instead post: debit a new "Card receivable / Stripe pending" account (asset 11xx), credit recipient payable + fee revenue. (Cleared when Stripe charge succeeds via webhook.)
  - Call the new `stripe-charge-card` function with `{ amount, currency: "cad", card_token, transfer_id, sender_id }`. On non-success: mark transfer failed and skip routing to Paysafe.
  - On success: route to Paysafe (Interac or EFT) exactly like the wallet path.
- Remove the `card_push → stripe-payout` branch (no longer reachable from this UI).

### New: `supabase/functions/stripe-charge-card/index.ts`
- Accepts `{ transfer_id, card_token, amount_cents, currency }`.
- Creates a Stripe `Source` from the token (or directly creates a `Charge` using the token as `source`) on the platform Stripe account — no Connect, no payouts.
- On success: updates `transfers.provider_charge_id` and returns `{ success: true, charge_id }`.
- On failure: returns `{ success: false, error, code }` with a friendly mapping (declined, insufficient funds, etc.) and the caller refunds/voids the ledger.

### `src/lib/stripePayouts.ts`
- Rename file conceptually to "Stripe card tokenization helper" — the existing `tokenizeDebitCard(stripe, element, { name, currency })` is reused as-is. (No code change needed; just no longer "payout"-specific.)
- Optional: add a JSDoc note that this now tokenizes the sender's funding card.

### `supabase/migrations/<new>.sql`
- Add `transfers.funding_source TEXT CHECK (funding_source IN ('wallet','card')) DEFAULT 'wallet'`.
- Add `transfers.provider_charge_id TEXT` (Stripe charge id for card-funded sends).
- Add a Chart of Accounts row for `1180` "Stripe Card Receivable (CAD)" if not already present, so the ledger can stage card-funded sends.

### Files that can be left alone
- `supabase/functions/stripe-payout/index.ts` — keep on disk but it becomes unused by this flow (still safe; webhook stays). Mark deprecated in a comment.
- `supabase/functions/stripe-payout-webhook/index.ts` — same; harmless if it never fires.
- `supabase/functions/paysafe-payout/index.ts` — unchanged.
- `src/components/settings/integrations/StripeConfig.tsx` and `VisaDirectConfig.tsx` — unchanged (still describe the integration that exists).

## Out of scope

- Saving sender cards for repeat use (would need `setup_intent` + `payment_method` storage; current flow tokenizes per-send).
- 3-D Secure / SCA — Canadian domestic charges generally don't require it; can be added later if Stripe requests it.
- Touching Paysafe, Flutterwave, or African flows.
- Removing the `card_push` payout_method enum value or the `stripe_payout_recipients` table — leaving in place to avoid breaking the existing migration.

## What the user will see after

- Step 1 shows two delivery tiles instead of three.
- Step 2 always asks for recipient info (email or bank), then a "How are you paying?" toggle. Picking "Card" reveals the Stripe card fields under the heading **"Your card details"**.
- Summary clearly shows: Delivery fee, Card processing fee (if applicable), Total charged, Recipient gets.
