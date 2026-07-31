## Phase 10 — Margin Guardrails & Pricing Optimisation

Phases 1-9 built pricing, routing, economics, cost assurance and settlement. Today margin problems are only detected *after* the fact: `partner-alerts-scan` raises a margin-floor alert hours later, and the routing engine happily executes a corridor at negative profit (no margin floor exists in `routingEngine.ts` — only a computed `margin_percent`). Retail pricing is also still adjusted by hand from the Profitability tab.

Phase 10 closes that loop: enforce margin at quote time, and turn the observed cost data into concrete pricing recommendations.

### What gets built

**1. Margin floor enforced at quote/execute time**
- Per-corridor and global minimum margin (percent and absolute) stored in config, editable in the UI.
- The routing engine scores candidates as today, then applies the floor: candidates under it are marked `below_floor` with the shortfall recorded on the routing attempt.
- Configurable behaviour per corridor: `warn` (execute, flag), `uplift` (raise the customer fee to hit the floor, if retail pricing allows) or `block` (reject the quote with a clear message).
- Every decision reason is persisted on `routing_decisions` so the Attempts tab shows exactly why a route was blocked or uplifted.

**2. Pricing recommendation engine**
- New SQL function comparing, per corridor/method, actual billed cost (Phase 9) and modelled cost against current retail pricing over a window, returning the fee change needed to reach the target margin.
- "Recommendations" tab: table of corridors with current fee, recommended fee, expected margin before/after, volume at risk, and confidence based on sample size.
- One-click apply writes a new `efinmoney_pricing` version through the existing supersede path — never an in-place edit, so history stays intact.

**3. Guardrail breach visibility**
- Blocked/uplifted quotes counted on the Live routing panel and surfaced as a new `margin_block` alert type in the existing alerts scan.
- Daily digest counters (blocks, uplifts, corridors below floor) on the Profitability header.

### Technical details

- Migration: `pricing_config` entries for `margin_floor_percent`, `margin_floor_min_amount`, `margin_floor_action`; `partner_corridors.margin_floor_percent` + `margin_floor_action` (nullable overrides); `routing_decisions.margin_action` + `margin_shortfall`; new function `pricing_recommendations(p_from, p_to, p_target_margin)` (security definer, `is_pricing_manager()` only).
- `supabase/functions/_shared/routingEngine.ts`: add a `applyMarginFloor()` step after scoring, returning the action and shortfall; `routing-quote` and `routingExecute.ts` respect it. Failover keeps working — a blocked primary falls through to the next candidate before rejecting outright.
- `partner-alerts-scan`: add the `margin_block` fingerprinted alert type; no new cron.
- Frontend: `useMarginGuardrails` in `usePartnerOps.tsx`; new `MarginGuardrailsPanel.tsx` and `PricingRecommendationsPanel.tsx` under `src/components/settings/partners/`, wired as tabs in `PartnerNetworkPanel.tsx`; recommendation apply reuses the existing pricing mutation hooks.
- No hardcoded rates or fees: floors come from config, recommendations derive from billed/modelled cost rows, and all pricing writes go through the versioned pricing tables.
