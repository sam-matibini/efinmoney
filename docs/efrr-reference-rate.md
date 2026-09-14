# eFinMoney EFX Reference Rate (EFRR)

EFRR is the platform FX reference used for accounting, reporting, management,
compliance, historical analysis, and reference pricing. It is **not** the
customer quote and **not** the settlement rate.

## Tiers

| Tier | Source | Role |
|------|--------|------|
| 1 | Bank of Canada Valet (daily FX vs CAD) | Primary reference |
| 2 | Open Exchange Rates (er-api fallback) | When BoC does not publish the pair, the API is down, or more currencies are required |
| 3 | ECB eurofxref | Validation only (divergence flagged, quote still publishes) |
| 4 | Payout / liquidity / banking partner | Execution rate that determines settlement economics |

Customer quote:

`CUSTOMER_RATE = (TIER_4_EXECUTION || EFRR) × (1 − EX_SPREAD) + fees`

Africa corridors (NGN, KES, ZMW, UGX, TZS, BIF, XAF, XOF, ZAR) often cannot
be obtained at the published mid. Partner liquidity is the cost floor.

## Refresh

`refresh-fx-rates` (hourly) fetches BoC, OXR, and ECB in parallel, writes
`efrr_observations`, publishes `efrr_rates`, and mirrors `fx_rates.rate = EFRR`
with `markup_rate = 0`.

## Audit snapshot

`freeze_fx_snapshot` writes an insert-only `fx_execution_snapshots` row:

Transaction ID, source, source rate, source timestamp, base/quote, EFRR,
eFinMoney spread, customer rate, rate timestamp, rate ID (`FX-YYYYMMDD-#####`),
provider execution rate, partner, FX revenue, status.

Updates and deletes on snapshots raise an exception.
