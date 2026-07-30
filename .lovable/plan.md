## Phase 5 — Activation, Liquidity & Cost Assurance

### Why this phase

A live check of the engine's tables shows the machinery is built but starved of data: 13 payment partners exist, but there are **0 rows** in `partner_pricing`, `partner_fx_rates`, `partner_liquidity`, `partner_performance`, `routing_decisions`, and `transaction_economics`. Without pricing and liquidity, the router cannot rank anyone and the profitability dashboard has nothing to show. Phase 5 makes the engine usable in production.

### 1. Seed and maintain partner data

- **Pricing seeding tool** — an admin action in the Pricing panel that generates a starter pricing row set for a selected partner across its enabled corridors, pre-filled with the partner's published rate card, so operators edit rather than type from scratch.
- **CSV import/export** for `partner_pricing` (download current, edit, re-upload with validation and a diff preview before commit). This is how rate cards actually arrive from partners.
- **Partner FX ingestion** — extend the existing `refresh-fx-rates` job to also write per-partner quotes into `partner_fx_rates` for partners that expose a rate endpoint, and allow manual entry for those that don't. Spread (`fx_spread_bps`) is already computed by a trigger.

### 2. Liquidity awareness

- **Liquidity snapshot job** (`partner-liquidity-refresh`, every 15 minutes): pulls each partner's available balance where an API exists, records it in `partner_liquidity`, and marks stale entries.
- **Router integration**: a partner whose available liquidity is below the transaction amount (or whose snapshot is stale beyond a threshold) is skipped with a recorded reason, so failover reaches for the next-best route instead of failing at the provider.
- Liquidity panel gains a "low / stale" status treatment and a manual balance-override entry for partners without an API.

### 3. Partner cost reconciliation

- New `partner_invoices` and `partner_invoice_lines` tables plus a `partner-invoice-reconcile` function that matches a partner's billed fees against `transaction_economics` costs per transaction.
- Output: a variance report (billed vs expected cost, unmatched transactions both ways) surfaced as a "Cost assurance" section in the Profitability tab. This is what catches silent partner over-billing.

### 4. Operator alerting

- A `routing-health-check` job (hourly) that raises admin notifications for: corridors transacting with no pricing on file, partners whose success rate drops below their configured floor, active kill switches, stale FX or liquidity data, and negative-margin corridors.
- Alerts land in the existing admin notifications surface — no new inbox.

### 5. Rollout controls

- A per-corridor **readiness check** shown in the Live Routing panel: pricing present, FX present, liquidity fresh, performance history present. A corridor can only be flipped to live routing when its checks pass, which prevents enabling a route the engine can't price.

### Technical notes

- New tables follow the existing pattern: explicit GRANTs, RLS restricted via `is_pricing_manager()`, `created_at`/`updated_at` with the shared update trigger.
- New scheduled functions are registered with `pg_cron` + `pg_net`, matching `partner-performance-refresh`.
- Router changes live in `_shared/routeResolver.ts` (candidate filtering) and `_shared/routingExecute.ts` (skip reasons in `routing_attempts`) — no changes to `execute-transfer`'s payout rails.
- UI additions reuse `PartnerNetworkPanel` tabs; no new routes.

### Out of scope

Real partner API credentials. Where a partner exposes no balance or rate API, the flow falls back to manual entry rather than blocking the phase.
