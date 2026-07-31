## Phase 11 — Automated Fee Adjustments

Phase 10 tells you *what* the customer fee should be (Pricing Recommendations) but a human still has to retype it into eFinMoney Pricing. Phase 11 closes the loop: recommendations become reviewable **proposals** that, once approved, write a new versioned `efinmoney_pricing` row automatically — with an optional scheduled auto-run.

### What gets built

**1. Proposal store (`pricing_proposals`)**
One row per corridor fee change: direction, source/dest currency, dest country, payment method, customer type; current vs proposed fixed/percentage fee and fx markup; the evidence snapshot (volume, revenue, effective cost, current margin, target margin, expected revenue uplift); `source` (`auto_scan` | `manual`); `status` (`pending` → `approved` | `rejected` | `applied` | `superseded`); reviewer, review note, applied pricing row id, timestamps.
Access restricted to pricing managers (`is_pricing_manager()`), plus service_role for the cron function.

**2. Guardrails config (`fee_adjustment_settings`)**
Single-row config: enabled on/off, target margin %, lookback days, minimum transaction count and minimum volume before a corridor qualifies, maximum allowed fee move per run (e.g. ±0.5pp, so a bad cost month can't 10× a fee), cooldown days between changes on the same corridor, and `auto_apply` (false by default → everything waits for approval).

**3. `pricing-adjust-scan` edge function (cron, daily)**
Calls the existing `pricing_recommendations` RPC with the configured window and target margin, filters by the qualification and cap rules, skips corridors already inside cooldown or with an open proposal, supersedes stale pending proposals for the same corridor, then inserts fresh `pending` proposals. When `auto_apply` is on and the delta is within cap, it approves and applies in the same pass. Emits a `fee_adjustment` alert into `partner_alerts` summarising proposals raised.

**4. `pricing-proposal-apply` edge function**
Approve/reject a proposal. On approve it inserts a new `efinmoney_pricing` row with `effective_from = now()` (existing versioning closes the prior row), stamps the proposal `applied` with the new row id, and writes an `audit_logs` entry. Rejection records the reviewer note only. JWT validated in-code and re-checks `is_pricing_manager` server-side.

**5. UI — Settings → Partners & Routing → new "Fee Adjustments" tab**
`FeeAdjustmentsPanel.tsx`: settings form for the guardrails above, a "Run scan now" button, and a proposal table (corridor, current → proposed fee, delta, margin now → after, evidence columns, status) with Approve / Reject actions and an expandable evidence row. Applied and rejected history behind a status filter.
`PricingRecommendationsPanel.tsx` gets a **"Create proposal"** action per row so a manual recommendation can enter the same approval queue.
Hooks added to `usePartnerOps.tsx` following the existing query/mutation pattern.

### Technical notes
- Fee writes always go through `efinmoney_pricing` inserts — no in-place updates — so history and the `effective_from/effective_to` chain stay intact.
- Cost basis reuses `pricing_recommendations` (approved billed cost, falling back to modelled cost), so Phase 9 invoice reconciliation feeds this directly.
- Cap, cooldown and minimum-volume checks run in the edge function and again at apply time, so a stale proposal can't slip through a later-tightened cap.
- Cron registered daily; `auto_apply` ships off so the first weeks are review-only.

### Order of work
1. Migration: `pricing_proposals`, `fee_adjustment_settings`, grants, RLS.
2. `pricing-adjust-scan` + `pricing-proposal-apply` edge functions, cron schedule.
3. `usePartnerOps.tsx` hooks.
4. `FeeAdjustmentsPanel.tsx` + tab wiring + Recommendations "Create proposal" action.
5. Alert type in `partner-alerts-scan`; memory update.
