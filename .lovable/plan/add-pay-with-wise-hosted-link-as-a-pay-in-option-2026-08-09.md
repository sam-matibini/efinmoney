# Add "Pay with Wise" hosted link as a pay-in option

Add Wise's hosted business payment page (`wise.com/pay/business/efintaxadvisorsltd1`) as a selectable checkout method for pay-ins, alongside the existing card, Interac and bank-transfer rails.

## How it works for the payer

1. Payer picks **Pay with Wise** on Top up, Send funding, or a payment link.
2. We create a pending Wise intent for the exact amount and show a unique payment reference (e.g. `efm-wise-…`) with a copy button.
3. Clicking **Continue to Wise** opens the hosted Wise pay page in a new tab, prefilled with the amount and currency where the link supports it.
4. Back in the app, a "waiting for your payment" panel polls the intent. When Wise reports the incoming credit, the existing `wise-webhook` matches it (reference first, then amount + currency on pending intents) and the wallet credits automatically.

Copy stays white-label except for the Wise handoff itself, which has to name Wise because the payer lands on Wise's page.

## Changes

1. **New shared component** `src/components/payments/WisePayLinkCard.tsx`
   - amount input (prefilled from the flow), create-intent call to the existing `wise-topup-intent` function, reference + amount summary with copy buttons, "Continue to Wise" button opening the hosted link, and the same 5s status poll / credited state used by `WiseTopUpCard`.
   - Reuses `supabase.functions.invoke` (correct key + session) — no `VITE_SUPABASE_ANON_KEY`.

2. **Link config** `src/lib/wisePayLink.ts`
   - Single source for the hosted URL, overridable with `VITE_WISE_PAY_LINK`, defaulting to the given business link, plus a helper that appends amount/currency query params and strips the `utm_source` param.

3. **Top up** (`src/pages/TopUpPage.tsx`)
   - New method entry `wise_link` — label "Pay with Wise", description "Bank transfer or card via Wise" — offered for CAD/USD/EUR/GBP wallets when `productFeatures.wise` is on. Sits after the CAD Interac/EFT block so the cheapest local rail stays first.

4. **Send funding** (`src/pages/SendPage.tsx` / the send checkout method grid)
   - Add the same option as a funding choice for CAD/USD/EUR/GBP, mirroring how Interac is wired: on success the transfer continues from the credited wallet.

5. **Payment links checkout**
   - Add `wise_link` as a claim/pay option in the public payment-link checkout so an external payer can settle a request through the hosted Wise page with the link's reference.

6. **Method picker** (`src/components/payments/CheckoutMethodGrid.tsx` + `checkoutStrings.ts`)
   - Extend `CheckoutMethod` with `wise` and add its row (wallet/landmark icon, localized title + description).

## Technical notes

- No new tables: `wise_topup_intents` already stores amount, currency, reference, status and expiry, and `wise-webhook` already credits on match. If the intents table has no channel/source column, one small migration adds `channel text default 'bank_transfer'` so hosted-link intents can be told apart in ops reporting — confirmed before writing SQL.
- Hosted Wise links can't guarantee the reference reaches us, so the reference is shown prominently with instructions to paste it into the Wise payment message; unmatched credits keep falling back to the existing amount + currency match on pending intents and then the admin notification.
- Payment-link payers are unauthenticated, so the link checkout path creates its intent through the existing public link edge path rather than the authenticated `wise-topup-intent` create action.
- Verification: `bunx tsgo --noEmit`, then a Playwright pass on `/top-up` (CAD + USD wallet), the send funding step, and one payment-link checkout to confirm the row renders, the reference shows, and the Wise tab opens with the right amount.
