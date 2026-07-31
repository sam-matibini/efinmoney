---
name: Automated Fee Adjustments
description: Phase 11 — pricing recommendations become reviewable fee proposals that publish new versioned customer pricing
type: feature
---

Phase 11 of the partner routing engine.

- `pricing_proposals`: one row per corridor fee change (current vs proposed fixed/percentage fee, evidence snapshot, `source` auto_scan|manual, `status` pending|approved|rejected|applied|superseded). Pricing managers only.
- `fee_adjustment_settings`: singleton row — enabled, auto_apply (off by default), target margin, lookback days, min txns/volume, `max_fee_delta_percent` cap, cooldown days.
- `pricing-adjust-scan` edge fn (cron daily 02:15 UTC): reads `pricing_recommendations`, filters by thresholds/cooldown, clamps the move to the cap, supersedes stale pending proposals, inserts new ones, auto-applies when enabled. Cron calls carry no user; manual calls require `is_pricing_manager`.
- `pricing_recommendations` RPC now also allows `service_role`.
- `pricing-proposal-apply` edge fn: approve/reject. Approve → `applyProposal()` in `_shared/pricingProposals.ts` inserts a NEW `efinmoney_pricing` row (never in-place update), closes prior open versions, writes `audit_logs`.
- Alert type `fee_adjustment` in `partner-alerts-scan` surfaces pending proposals.
- UI: Settings → Partners & Routing → **Fee adjustments**; Recommendations tab has a "Proposal" button per row.
