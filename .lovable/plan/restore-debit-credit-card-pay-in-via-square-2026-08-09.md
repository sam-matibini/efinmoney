# Restore debit/credit card pay-in via Square

Card payment disappeared from the hosted checkout method picker — it only offers Interac, Wise and EFT. Square itself is still fully wired (`square-create-checkout`, `square-verify-checkout`, `SquareTopUpCard`, `square_checkout_intents`) and still appears on the Top up page method list. The work is to make Square the card rail everywhere a customer pays in.

## What changes for the user

1. **Hosted checkout (CAD collection panel)** gains a first row: "Debit or credit card — Visa, Mastercard, Amex, Apple Pay, Google Pay, powered by Square". Choosing it opens the Square hosted page and credits the wallet on return.
2. **Top up page** keeps the Square card method, shown first for USD/CAD/EUR/GBP so card is the obvious default again.
3. **Send flow**: when a transfer is funded by card and the collect currency is USD/CAD/EUR/GBP, Square becomes the preferred provider — the sender pays on Square's hosted page, the wallet is credited on return and the transfer then executes from the wallet (same resume pattern already used for the other card providers). Non-Square collect currencies (NGN, GHS, KES, UGX, RWF, TZS, ZMW, XAF, XOF) keep their existing providers.

Square supports pay-in only, so payouts are untouched.

## Technical notes

- `src/components/payments/CheckoutMethodGrid.tsx`: add `"card"` to `CheckoutMethod`, render it as the first row with a `CreditCard` icon; new EN/FR strings in `checkoutStrings.ts`.
- `src/components/topup/CadCollectionPanel.tsx`: default `method` selection to `card`, render `SquareTopUpCard` (embedded) for that branch; gate on currency in Square's supported set.
- `src/pages/TopUpPage.tsx`: order the `square` rail ahead of the Wise/Interac rails for the Square-supported currencies (priority list in `src/lib/walletTopupGateway.ts`).
- Send funding via Square:
  - add `"square"` to `CardSendProvider` (`src/lib/cardSendIntent.ts`) and to `cardSendProvidersForCorridor` / `pickBestCardProvider` in `src/lib/cardSendRails.ts`, limited to USD/CAD/EUR/GBP collect.
  - in `src/pages/SendPage.tsx`, when the picked provider is `square`, save a card-send intent, call `square-create-checkout` with a redirect back to the send route, and on return verify with `square-verify-checkout` and continue the existing "wallet-funded" execution path.
  - `MethodCheckoutPanel` shows a short "you'll finish on Square's secure page" note instead of inline card fields for the Square provider (no PAN captured by us).
- No database migration needed; `square_checkout_intents` and the ledger credit helper already exist.

## Verification

- Type check, then walk the CAD top-up checkout in the preview: card row present, Square page opens, return credits the wallet.
- Walk a CAD-funded send to confirm the Square hand-off and post-return execution.
