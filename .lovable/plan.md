## Phase 12 — Partner Scorecards & Performance-Weighted Routing

Phases 1–11 built routing, profitability, guardrails and automated customer-fee adjustments. What's still missing is the other half of the loop: judging *partners* on realised outcomes and letting that judgement steer routing automatically. Today routing ranks candidates on quoted cost/profit; a partner that quotes cheaply but fails 8% of payouts or settles late still wins the route.

### What gets built

**1. Partner scorecards (`partner_scorecards`)**
One row per partner per corridor per period (rolling window, refreshed daily): attempt count, success rate, average and p95 settlement time, dispute/chargeback rate, cost variance vs quote (from Phase 9 invoice reconciliation), realised margin vs modelled margin, liquidity incident count. Each dimension scored 0–100 with configurable weights, rolled into a single `composite_score` and a letter grade.

**2. Scoring config (`partner_score_weights`)**
Single-row config: weight per dimension, lookback days, minimum attempts before a score is trusted, and a `min_score_to_route` threshold plus the action taken below it (`warn` | `deprioritise` | `block`) — mirroring the margin-floor pattern from Phase 10 so the behaviour is familiar.

**3. `partner-scorecard-scan` edge function (cron, daily)**
Aggregates `routing_attempts`, `transfers`, `partner_settlements`, `partner_invoice_lines` and `transaction_economics` over the window, writes/updates scorecards, and emits a `partner_score` alert into `partner_alerts` when a partner drops a grade or falls below the routing threshold.

**4. Routing integration**
`_shared/routingEngine.ts` gains a score modifier applied after the margin floor: below-threshold candidates are deprioritised (score penalty on the ranking value) or excluded outright when the action is `block`, with the reason recorded on the routing decision so Attempts and the Simulator show *why* a cheaper partner lost. Missing/low-confidence scores are neutral — never penalising.

**5. UI — Settings → Partners & Routing → new "Scorecards" tab**
`PartnerScorecardsPanel.tsx`: partner × corridor grid with composite score, grade, trend arrow vs prior period, and per-dimension breakdown on expand; weights/threshold form; "Run scan now". The Partners tab gets a score chip per partner, and the Simulator surfaces the score modifier in its candidate breakdown.

### Technical notes
- Scores are derived and recomputed, never hand-edited — the config is the only writable surface.
- Score influence is capped so it can shade ranking but cannot force a route that breaks a margin floor; guardrails stay authoritative.
- `min_attempts` guards against a single failed payout tanking a new corridor.
- Cron daily after the invoice-reconcile job so cost-variance inputs are settled.
- Access restricted to pricing managers / admins, plus service_role for the cron.

### Order of work
1. Migration: `partner_scorecards`, `partner_score_weights`, grants, RLS.
2. `partner-scorecard-scan` edge function + cron.
3. Routing engine score modifier + decision reason plumbing.
4. `usePartnerOps.tsx` hooks.
5. `PartnerScorecardsPanel.tsx` + tab wiring + Partners/Simulator surfacing.
6. `partner_score` alert type; memory update.