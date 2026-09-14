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

Customer FX rate uses the eFinMoney EFX Reference Rate (EFRR) plus the
corridor EX spread, with partner liquidity as the execution floor:

```
Bank of Canada (primary)
        ↓
eFinMoney FX Reference Rate Service  →  OXR fallback  →  ECB validation
        ↓
EFRR (accounting / reporting / compliance)
        ↓
Partner execution rate (payout / liquidity / banking partner)
        ↓
Pricing engine: EX spread + fees + margin
        ↓
Customer quote
```

`CUSTOMER_RATE = (EXECUTION_RATE || EFRR) × (1 − FX_SPREAD)`

BoC is the Tier 1 reference (CAD pairs and CAD crosses). Open Exchange Rates
is Tier 2 when BoC does not publish the currency (NGN, KES, ZMW, XOF, …) or
the Valet API is down. ECB eurofxref is Tier 3 validation only. The live
payout-rail rate is Tier 4 execution — Africa corridors must not be priced
as if the published mid were obtainable liquidity.

CAD→NGN bank internal EX spread is **0.60%**. Each executed send or FX swap
freezes an immutable `fx_execution_snapshots` row (FINTRAC / RPAA).

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
`supabase/migrations/20260913220000_cad_ngn_competitive_fx.sql`,
`supabase/migrations/20260913233000_corridor_provider_fx_read.sql`, and
`supabase/migrations/20260914010000_efrr_reference_rate_service.sql`.
Redeploy `refresh-fx-rates`, `corridor-provider-fx`, and `fx-engine`.
`refresh-fx-rates` now publishes EFRR (BoC → OXR → ECB validate) into
`efrr_rates` / `fx_rates.rate` with **no baked-in 0.50% markup**. Customer
EX spread lives on the corridor card. Apply freeze_fx_snapshot after each
FX execution.

## Verify

```sh
npm run test:pricing
```
