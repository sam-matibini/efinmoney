# Fee-on-top pricing + colored checkout method row

## 1. Fee added on top of the send amount

Today the fee is deducted from what you send: entering 2.00 CAD sends ~1.70 CAD worth to the recipient. It will change to fee-on-top:

- You send: 2.00 CAD → recipient gets the full 2.00 CAD equivalent at the rate
- Fee: 0.30 CAD
- Total charged / debited: 2.30 CAD

Applies to the international send flow (`/send`), the Canada send flow, and the review/confirm summaries, which will show three lines: Amount, Fee, Total to pay.

Guards updated to use the total, not the send amount:
- Wallet balance / insufficient-funds check compares against amount + fee
- Card and bank charge amount = amount + fee
- Minimum-amount and "amount must exceed fee" validation adjusted

Ledger/transfer records keep `source_amount` = the amount sent and `fee_amount` = the fee, so double-entry stays consistent; the funding leg debits the total.

## 2. Payment method row at the top of Send Money

- Move the funding selector to the top of the Amount step, above "From wallet", as one row of three buttons: Card, Bank, Wallet.
- Each gets its own accent color (card, bank, wallet) using new semantic tokens in `index.css` / Tailwind config, with a clear selected state — no hardcoded color classes.
- The wallet picker, bank picker or card fields render below, based on the selection. The collapsible "Pay with card or bank" panel and the "Use wallet instead" link are removed as redundant.
- The same three-button colored row is added to the top of the Top-up flow (`TopUpPage`), driving the existing gateway/method list below it.

## Technical notes

- `src/pages/SendPage.tsx`: change `receivedAmount` to `parsedAmount * effectiveRate`, add `totalCharge = parsedAmount + fee`, update `insufficientFunds`, step validation, card/bank charge payloads and the confirm summary rows; restructure the funding-source JSX into a top method row.
- `src/components/send/CanadaSendFlow.tsx`: same fee-on-top math for `deliveryFee` + `cardFee`, review rows and charge amount.
- `src/pages/TopUpPage.tsx`: add the colored method row above `CheckoutMethodList`.
- New shared component `src/components/money/PaymentMethodRow.tsx` used by both flows.
- Fee values still come from the canonical `price-quote` rate card; no pricing logic or hardcoded amounts introduced.
