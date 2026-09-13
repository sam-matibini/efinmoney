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

Customer FX rate — **corridor provider FX plus eFinMoney internal margin**,
applied once. Do not quote from CBN / Open Exchange mid when a live payout
rail quote exists, and never stack `fx_rates.effective_rate` (already marked)
on top of the corridor spread.

`CUSTOMER_RATE = PROVIDER_FX × (1 − FX_SPREAD)`

`PROVIDER_FX` is the live rate from the corridor payout partner (Nomba,
Flutterwave, Fincra, Wise, …). If several rails quote the pair, we prefer the
rate-card / routed partner, otherwise the best live quote. Treasury
`fx_rates.rate` is the fallback only.

CAD→NGN bank internal margin is **0.60%**. A Nomba/Sendwave-class provider
rate of ₦971.89 becomes about ₦966.06 — above CBN official, with a single
eFinMoney spread.

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
CAD→NGN cards drop from 1.50%–1.75% to 0.60%–0.70%, and
`supabase/migrations/20260913233000_corridor_provider_fx_read.sql` so checkout
can read live `partner_fx_rates`. Redeploy `corridor-provider-fx` and
`fx-engine` after pull. Checkout quotes **provider FX + internal margin**;
the SQL keeps the admin workbook and `price-quote` in sync.

## Verify

```sh
npm run test:pricing
```
