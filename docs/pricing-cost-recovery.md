# eFinMoney cost-recovery pricing

Customer rates rebuild from integrated partners, enabled corridors, partner
cost sheets, live FX and active currencies. Administrators correct the
Pricing & Fees workbook; saved overlays stay in place when new corridors
appear.

Checkout must not hard-code `0.5%`.

## Formula

Customer price = partner cost + payment cost + payout cost + liquidity cost +
FX hedge / volatility + compliance / risk + eFinMoney margin.

Customer fee = max(minimum fee, variable fee, cost-recovery floor).

Customer FX rate:

`CUSTOMER_RATE = MID_MARKET_RATE × (1 − FX_SPREAD)`

Example: 1 CAD = 0.7213 USDC mid with a 0.60% spread → `0.7213 × 0.994` =
0.71697 USDC.

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

## Verify

```sh
npm run test:pricing
```
