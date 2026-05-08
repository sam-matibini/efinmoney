## Goal

Let users **link an existing external card** (number, expiry, CVV) inside the Add New Card modal so they can use it to fund their eFinMoney wallets — alongside the existing "issue a new card" flow.

## UX

The Add New Card modal gets a top toggle:

- **Issue new card** (current behaviour — generates PAN/CVV/expiry).
- **Link existing card** (new) — user manually enters their real card details to use as a funding source.

When **Link existing card** is selected, the form shows:

- Cardholder Name
- Card Number (16 digits, formatted as `4242 4242 4242 4242`, network auto-detected from BIN: Visa `4`, Mastercard `5`)
- Expiry MM/YY
- CVV (3 digits)
- Linked Wallet (which wallet this card will fund)
- Nickname (optional)

After save, the card appears in the cards grid with a **"Fund Wallet"** action that opens the existing `CardPaymentModal` pre-selected to the linked wallet, so the user can top up.

## PCI compliance (important)

Raw PAN and CVV must **not** be persisted in our database. On submit we:

- Validate PAN with Luhn + length 13–19.
- Save only `last_four`, `expiry_month`, `expiry_year`, detected `card_network`, `funding_source = 'external'`, plus cardholder name and linked wallet.
- Never write `card_number` or `cvv` columns for external cards.
- Show a small notice: "For top-ups we re-collect your card via our payment processor. Your full number and CVV are never stored."

The actual charge still flows through the existing Stripe `CardPaymentForm` (which tokenizes via Stripe Elements).

## Changes

### `src/components/modals/AddCardModal.tsx`
- Add mode toggle (Tabs or segmented control) at the top: `Issue new` / `Link existing`.
- New "Link existing" form with the fields above + Luhn validation + auto network detection.
- On save, call `createCard` with `card_type: 'debit'`, `funding_source: 'external'`, only `last_four` + expiry fields (no full PAN, no CVV).

### `src/hooks/useCards.tsx`
- Allow `createCard` input to accept a pre-validated external payload (skip PAN/CVV generation when `funding_source === 'external'`).

### `src/pages/CardsPage.tsx`
- For cards with `funding_source === 'external'`:
  - Hide the reveal-PAN button and CVV cell (we don't have them).
  - Show a primary **"Fund Wallet"** button that opens `CardPaymentModal` with the card's `wallet_id`.
- Internally-issued cards keep the current reveal/copy UI.

### Database
No migration needed — the previous migration already added `expiry_month`, `expiry_year`, `funding_source`, and `card_number`/`cvv` are nullable.

## Out of scope
- Tokenizing and saving the external card with Stripe (SetupIntent + saved payment methods). Today we re-collect the card via Stripe Elements at top-up time, which is acceptable for the prototype and avoids PCI scope.
