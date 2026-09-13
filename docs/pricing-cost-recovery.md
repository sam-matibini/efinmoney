# eFinMoney cost-recovery pricing

Customer rates rebuild from integrated partners, enabled corridors, partner
cost sheets, live FX and active currencies. Administrators correct the
Pricing & Fees workbook; saved overlays stay in place when new corridors
appear.

Checkout and wallet FX quotes use `quoteTransfer`. Posted transfer fees
credit CoA **4200 Transfer Fees**, so Chart of Accounts, Trial Balance,
statements and Reports Centre stay in sync with the live rate card.

## Formula

Customer price = partner cost + payment cost + payout cost + liquidity cost +
FX hedge / volatility + compliance / risk + eFinMoney margin.

Customer fee = max(minimum fee, variable fee, cost-recovery floor).

Customer FX rate (applied once, to true mid-market `fx_rates.rate` — not to
the already-marked `effective_rate`):

`CUSTOMER_RATE = MID_MARKET_RATE × (1 − FX_SPREAD)`

CAD→NGN bank uses a **0.60%** spread so the customer rate stays **above CBN
official** and close to remittance peers (Sendwave). Do not stack the 0.50%
`refresh-fx-rates` markup on top of this spread.

## Wallet vs external

- Wallet-to-wallet uses the internal wallet card (CAD→USDC is 0.50% spread +
  C$0.50 minimum). Fee is deducted from the send amount.
- External payout uses corridor rates plus contracted partner costs in the
  floor. Fee is charged on top of the send amount.

A C$3 CAD→USDC wallet conversion is C$0.50, not C$0.01.

## Excel workbook

Download from Settings → Pricing & Fees, or:

```sh
npm run export:rate-card
```

The file is written to `public/docs/eFinMoney-Rates-and-Pricing-Summary.xlsx`.

Sheets: Summary, Customer Corridor Rates, Wallet Rates, Volume Discounts,
Payout Minimums, Pricing Engine, Examples, Admin Configuration.

## Database

Apply `supabase/migrations/20260911010000_cost_recovery_rate_cards.sql`
(or run `supabase/scripts/seed-cost-recovery-rate-cards.sql` in the production
SQL Editor). That seeds `corridor_rate_cards`, payout-method minimums, volume
tiers, and versioned `efinmoney_pricing` rows with minimum fees.

Existing environments also need
`supabase/migrations/20260913220000_cad_ngn_competitive_fx.sql` so published
CAD→NGN cards drop from 1.50%–1.75% to 0.60%–0.70%. Checkout quotes from
`fx_rates.rate` (mid) in the app; the SQL keeps the admin workbook and
`price-quote` in sync.

## Verify

```sh
npm run test:pricing
```
