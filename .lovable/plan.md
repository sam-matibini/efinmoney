## Goal

A centralized Payment Intelligence & Routing Engine: partner pricing and FX are stored as versioned data (never hardcoded, never overwritten), every candidate route is costed and scored, the best route is selected by a configurable strategy, and every decision is auditable and reportable by partner, corridor, currency, method, customer and period.

## Current state (verified)

- The only pricing data in the database today is `pricing_config` with two rows (`transfer_base_fee` 0.30, `transfer_card_surcharge` 0) plus `cpn_corridors` (Circle-only markup_bps).
- `src/hooks/usePricingRules.tsx` queries a `pricing_rules` table that does **not** exist in the database — that hook is dead code today.
- There are 173 edge functions, with roughly 20 distinct payout/pay-in providers each invoked directly (`flutterwave-payout`, `nomba-payout`, `pawapay-payout`, `paytota-payout`, `fincra-payout`, `paysafe-payout`, `ghana-payout`, `mtn-momo-payout`, `initiate-cpn-payout`, Adyen/Stripe/Elicate pay-ins…). Rail choice today is hardcoded in client helpers such as `src/lib/canadaPayoutRails.ts` and `cardSendRails.ts`.

So this is greenfield data-wise, and the integration job is to put a decision layer *in front of* the existing provider functions rather than rewriting them.

## Phasing

Given the size, I propose four phases. Phase 1 and 2 give a working engine in shadow mode; Phase 3 turns on live routing and failover; Phase 4 is analytics depth.

### Phase 1 — Data model + admin pricing management

Migrations creating (all with GRANTs, RLS, admin/finance-only write, `updated_at` triggers):

- `payment_partners` — identity, type (payin/payout/both), country, regulatory + API + integration status, settlement currency, settlement time, reliability score, compliance risk, priority, status. Also `function_slug` so the engine knows which edge function executes the route.
- `partner_corridors`, `partner_payment_methods`, `partner_limits` (min/max/daily/monthly per corridor+method).
- `partner_pricing` — direction, corridor, currencies, method, fee type (fixed/percent/tiered), fixed/percent/min/max fee, settlement fee, network fee, compliance fee, FX markup, `effective_from`/`effective_to`, `source` (api/file/manual), `updated_by`, status. **Append-only**: a new price closes the previous row's `effective_to` via trigger; nothing is ever updated in place.
- `partner_fx_rates` — partner rate, mid-market reference, computed spread, timestamp, expiry, source, status. Also append-only.
- `efinmoney_pricing` — customer-facing fee schedule by customer type, corridor, transaction type, fixed/percent/min/max fee, FX margin, effective dates.
- `routing_rules` — named strategies with weights (profit, success rate, FX competitiveness, speed, risk), plus an `active` flag so the strategy is switchable without a deploy.
- `partner_liquidity` — balance by currency, required reserve, daily utilization, available capacity.
- `partner_performance` — rolling success rate, failure rate, avg processing time, reversals, computed nightly from `transfers`.

Admin UI: a new **Partners & Pricing** section under `/settings` (new tabs) with CRUD panels for partners, corridors/limits/methods, pricing versions (with full history view and "supersede" instead of edit), eFinMoney customer pricing, FX rates, liquidity, and the routing strategy editor with live weight sliders. CSV/Excel upload for partner pricing and rate cards, with a preview-and-confirm step that records source + timestamp + user.

### Phase 2 — Cost, profit and routing engine (shadow mode)

New shared module `supabase/functions/_shared/routingEngine.ts` implementing the pipeline:

1. **Eligibility** — filter partners by country, currency pair, method, amount vs limits, daily/monthly utilization, API status, compliance restrictions, customer risk tier, liquidity available.
2. **Pricing** — resolve the pricing row and FX rate valid *at request time*; for partners exposing live quotes, call their quote endpoint with a short timeout and fall back to stored pricing.
3. **Cost** — partner fee (with min/max), FX cost measured against the mid-market reference, plus network, settlement and compliance fees → total landed cost.
4. **Revenue** — eFinMoney fee + FX margin from `efinmoney_pricing`.
5. **Profit** — gross profit, gross margin %, then expected profit = gross profit × success probability − expected failure/return cost; contribution profit subtracts fraud, chargeback, screening, KYC and infrastructure allowances (configurable per-transaction rates).
6. **Score & rank** — weighted score per the active `routing_rules` strategy (lowest cost / highest profit / highest expected profit / best overall).

New edge function `route-quote` returns the full ranked candidate list plus the recommendation, and persists it to `payment_routes` (the calculated snapshot) and `routing_decisions` (the audit record: every candidate's cost/profit/success rate, the winner, the rule used, pricing source, timestamp, operator override flag).

Shadow mode: existing send flows call `route-quote` for logging and display only; the current hardcoded rail still executes. This lets us validate the numbers against real traffic before handing it the wheel.

### Phase 3 — Live routing, override and failover

- `execute-transfer` (and the pay-in funding path) calls `route-quote`, then dispatches to the selected partner's edge function via the `function_slug` mapping — no per-partner branching in the caller.
- Operator override: authorized admins can pick a different candidate in the send/admin UI; the override and its reason are written to `routing_decisions`.
- Failover chain: on a confirmed partner failure, retry the next-ranked eligible route, guarded by an idempotency key, retry counter, and a status re-check against the partner before re-attempting, so a payment is never executed twice.
- Cost capture: `payment_transaction_costs` and `payment_transaction_revenue` rows are written at execution with the *actual* pricing used, then reconciled against partner settlement statements (`partner_settlements`, `partner_reconciliation`) to produce actual-vs-expected variance.

### Phase 4 — Dashboards

New `/admin/routing` (or a tab in the Operations dashboard) with:

- **Partner comparison** — pay-in/pay-out coverage, avg fee, FX rate, avg cost, success rate, profit.
- **Corridor profitability** — volume, revenue, cost, gross profit, margin per corridor.
- **Transaction drill-down** — per transaction: amount, customer fee/rate, partner selected, partner fee/rate, total cost, revenue, gross profit, margin, and the full routing decision trail.
- **Daily / monthly rollups** and the KPI set (revenue and cost per transaction, margin, partner concentration, FX income vs FX cost, net FX margin).
- **Partner profitability matrix** for management, with an overall score per partner.
- Filters across date, country, corridor, currency, direction, partner, method, customer, transaction size.

## Technical notes

- Rollups use materialized views or scheduled aggregation into `partner_performance`, refreshed by a cron edge function, so dashboards stay fast as `transfers` grows.
- FX mid-market reference reuses the existing `fx-engine` / `market-rates` feed; no new market data provider.
- The dead `usePricingRules` hook is repointed at the new `partner_pricing`/`efinmoney_pricing` tables rather than left broken.
- Everything routing-related is data-driven: adding a partner or changing strategy is a row change, not a deploy.

## Not changing

- The existing provider edge functions' internal logic, the double-entry ledger, or the compliance/AML engines.
- Live traffic behaviour until Phase 3 is explicitly approved after shadow-mode results look right.

I suggest starting with Phase 1 only, so you can load real partner rate cards and confirm the model matches how your partners actually price before any routing logic is written.
