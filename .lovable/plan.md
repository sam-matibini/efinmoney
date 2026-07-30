## Phase 4 — Profitability Engine & Performance Analytics

Phases 1–3 built partner pricing, the scoring engine, live routing and operator controls. What is still missing is the money view: the `transaction_economics`, `routing_decisions` and `partner_performance` tables all currently hold 0 rows, so no revenue, cost or success-rate data feeds back into routing or reporting. Phase 4 closes that loop.

### 1. Capture economics on every transfer

- On a successful payout dispatch (routed or legacy rail), write one `transaction_economics` row: customer fee revenue, FX revenue, partner fee/FX cost, settlement, network, compliance and infrastructure cost, plus derived total revenue, total cost, gross profit and margin.
- Reuse the existing `routingEngine.ts` cost/revenue math so estimated and actual figures are computed identically.
- For legacy (non-routed) transfers, derive revenue from `transfers.fee_amount` and the applied rate versus the mid-market rate, and cost from the matching `partner_pricing` row; flag rows where pricing is missing rather than silently assuming zero cost.
- Backfill economics for the 23 already-completed transfers so the dashboard opens with real data.

### 2. Partner performance refresh

- New scheduled edge function `partner-performance-refresh` (hourly) that recomputes `partner_performance` per partner and corridor over 7/30/90-day windows: counts, success rate, reversal rate, average processing seconds — sourced from `transfers`, `routing_attempts` and `routing_decisions`.
- The route scorer already reads `partner_performance`, so refreshed success rates immediately sharpen live route selection.

### 3. Profitability reporting

- Security-definer SQL functions (pricing-manager gated) that aggregate `transaction_economics` by partner, corridor, currency and period, returning volume, revenue, cost, profit and margin.
- A second function for estimate-versus-actual variance, joining each economics row to its `routing_decisions` candidate so operators see where the engine's forecast drifted.

### 4. Profitability dashboard UI

New "Profitability" tab under Settings → Partners & Routing, with:
- Period selector (7/30/90 days, custom) and headline cards: volume, revenue, cost, gross profit, blended margin.
- Profit by partner, by corridor and by currency tables, sortable, with margin badges.
- Estimate-vs-actual variance panel highlighting the largest deviations.
- A "pricing gaps" list showing corridors transacting without a `partner_pricing` row — these are the blind spots costing unmeasured margin.

### Technical notes

- Migration adds the aggregation functions plus an `economics_source` column (`routed` / `legacy` / `backfill`) on `transaction_economics`, and enables the hourly cron for `partner-performance-refresh`.
- Economics writes are idempotent via the existing unique index on `transaction_economics.transfer_id`.
- Recording economics never blocks a payout: failures are logged and swallowed, matching the existing `observeRoute` behaviour.
- Frontend follows the established `usePartnerNetwork` / loose-`db` accessor pattern to keep generated Supabase types shallow.
