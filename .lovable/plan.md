## Phase 13 — Forecasting, Pre-Funding & Incident Control

Phases 10–12 measure what already happened. Phase 13 looks forward (what volume and margin is coming, and whether we can fund it) and closes the loop from alert to action.

Also fixes a Phase 12 gap: `partner-scorecard-scan` exists and is deployed but has no cron job registered, so scorecards only update when someone clicks "Run scan now".

### 1. Corridor forecasting engine

New table `corridor_forecasts`: one row per corridor and horizon (7 / 30 / 90 day), holding forecast volume, transaction count, revenue, cost, gross profit, projected margin, the method used, and a confidence band (low/base/high).

New edge function `corridor-forecast-scan` (daily cron): reads `transaction_economics` history per corridor, fits a simple trend + day-of-week seasonality baseline, projects volume forward, then applies current effective pricing and current partner costs to project revenue, cost and margin. Corridors with too little history are marked low-confidence rather than dropped.

### 2. Liquidity forecasting & pre-funding tasks

New table `liquidity_forecasts` (per partner and currency: current available balance, required reserve, forecast daily burn, projected days-to-dry, recommended top-up amount) and `funding_tasks` (partner, currency, amount, due-by, status open/in_progress/funded/cancelled, assignee, notes).

`corridor-forecast-scan` also projects float burn-down: forecast corridor volume mapped to partner share (from recent routing attempts) against `partner_liquidity.available_balance` minus `required_reserve`. When projected days-to-dry falls below the configured warning window, it opens or updates a `funding_task` and raises a `liquidity_forecast` alert. Tasks dedupe per partner/currency so a daily scan doesn't spam the queue.

### 3. Incident-driven auto-suspension

New table `partner_suspensions`: partner, optional corridor key, reason, trigger source (`scorecard` | `alert` | `manual`), suspended_from/until, cooldown minutes, auto_restore flag, status, and who acted.

New edge function `partner-incident-scan` (hourly cron) with a settings row (`incident_settings`): thresholds for consecutive critical alerts, failure-rate spike, and scorecard grade/score floor. When breached it suspends the partner (globally or corridor-scoped), writes an `audit_logs` entry and raises a `partner_suspended` alert. On the next pass, if the trigger condition has cleared and the cooldown has elapsed and `auto_restore` is on, it lifts the suspension automatically.

`routeResolver.ts` reads active suspensions before ranking and excludes suspended partners/corridors with reason `suspended: <cause>`, so failover to the next candidate is automatic. Suspension is checked before margin floors and scores — it is the hardest guardrail in the chain.

Manual suspend / resume from the UI goes through `partner-incident-apply` (pricing-manager authenticated), so every change is audited the same way.

### 4. UI — three additions under Settings → Partners & Routing

- **Forecasts** tab (`CorridorForecastPanel.tsx`): horizon selector, corridor table with projected volume, revenue, cost, margin and confidence, a sparkline of history vs forecast, and totals across the network.
- **Funding** tab (`LiquidityForecastPanel.tsx`): partner/currency float table with days-to-dry and a colour-coded runway, plus the funding-task queue with mark-funded / cancel actions.
- **Incidents** tab (`PartnerIncidentsPanel.tsx`): threshold settings form, active suspensions with time remaining and manual resume, suspension history, and a manual suspend dialog.

Hooks follow the existing `usePartnerOps.tsx` query/mutation pattern.

### 5. Cron and alerting

- Register `partner-scorecard-scan` daily at 02:40 UTC (missing from Phase 12).
- Register `corridor-forecast-scan` daily at 03:00 UTC.
- Register `partner-incident-scan` hourly at :35.
- `partner-alerts-scan` gains `liquidity_forecast`, `margin_forecast` (projected margin falling below floor) and `partner_suspended` alert types, using the existing fingerprint/auto-resolve pattern.

### Technical notes

- Forecasting stays deterministic SQL/TypeScript — no model service, no new dependency. Method is recorded per row so it can be upgraded later without a schema change.
- All new tables get GRANTs plus pricing-manager RLS, matching `pricing_proposals` and `partner_scorecards`.
- Suspension checks are enforced server-side inside `routeResolver`, not in UI, so a stale browser can't route around them.
- Auto-suspension ships enabled for `block`-severity triggers only, with `auto_restore` on and a 60-minute cooldown, so a transient partner outage self-heals.

### Order of work

1. Migration: `corridor_forecasts`, `liquidity_forecasts`, `funding_tasks`, `partner_suspensions`, `incident_settings` + grants/RLS.
2. `corridor-forecast-scan`, `partner-incident-scan`, `partner-incident-apply` edge functions.
3. `routeResolver.ts` suspension gate.
4. Hooks in `usePartnerOps.tsx`.
5. Three panels + tab wiring.
6. Cron registration (including the missing scorecard job) and new alert types.
