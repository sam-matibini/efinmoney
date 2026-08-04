# Sendwave-style single-page transfer form

## 1. Default currency = sender's base currency

Today the send form picks the first wallet in the list, so a Canadian user can land on a USD or NGN wallet. It will always start on the currency of the sender's domicile country (Canada → CAD, Nigeria → NGN), falling back to their saved preference, then CAD.

- On load, the source wallet defaults to the wallet matching the base currency; if no such wallet exists, the amount is still quoted in the base currency and the user is prompted to top up or pick another wallet.
- The FX calculator's "You send" currency and the card "Charge in" currency start from the same base currency.
- Quick-send links and saved handoffs still win over the default when they specify a currency.

## 2. One-page transfer form (Sendwave style)

The current flow splits Amount (step 1) and Recipient (step 2). They merge into a single "Send money to" page matching the reference:

```text
Send money to                [ 🇿🇲 Zambia  v ]
+-----------------------------------------+
| RECIPIENT   [ Recipient name      ] [+] |
+-----------------------------------------+
| YOU SEND        | THEY RECEIVE  | ZMW v |
|  $0.00          |   0.00        |       |
+-----------------------------------------+
   Exchange Rate: 1 CAD = 13.213 ZMW
   Transfer fees: 0.99 CAD fee
        [   Continue to send   ]
```

- Destination country picker sits in the page header, next to the title.
- Recipient row first: name field with a person-plus icon on the right for quick add.
- Paired You send / They receive inputs (either side editable, live two-way conversion) with the destination currency selector on the receive side.
- Rate and fee shown as two plain lines under the inputs; fee stays fee-on-top (total to pay shown on the review step).
- Country-specific payout fields (mobile network, Nigeria/Ghana bank + account with name resolution) render directly under the recipient row once a country needing them is chosen.
- The payment method row (Card / Bank / Wallet) and its method-specific checkout panel stay below, unchanged.
- Steps become: 1) Send money to (amount + recipient + funding), 2) Review & confirm, 3) Success. The step header/progress updates to match.

## 3. Quick add recipient

- The person-plus icon in the recipient row and an "Add contact >" link open the existing Add contact modal; the saved contact is selected immediately and fills name, phone, country, and bank details.
- The existing contact dropdown stays as the way to pick a saved recipient, with "Browse all contacts" for the full list.

## Technical notes

- `src/pages/SendPage.tsx`: default `selectedWalletId` from `useBaseCurrency()` / `countryToCurrency(profile.address_country)` instead of `wallets[0]`; merge the step 1 and step 2 JSX into one step, renumber `goToStep` targets and validation, keep `handleConfirm` and all payout/gateway logic untouched.
- New `src/components/send/SendToCard.tsx` holds the Sendwave header + recipient row + paired amount inputs + rate/fee lines, driven by props from SendPage.
- Reuse `ContactQuickField` and `AddBeneficiaryModal` for the quick add; no hook or schema changes.
- Reuse existing rate resolution (`resolveEffectiveRate`, `usePriceQuote`); no new pricing logic, no hardcoded rates or fees.
- Canada domestic and P2P flows are untouched in this change.
