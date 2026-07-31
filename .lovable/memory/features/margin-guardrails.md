---
name: Margin Guardrails & Pricing Optimisation
description: Margin floors enforced at routing time (warn/uplift/block) plus billed-cost-based pricing recommendations
type: feature
---

Phase 10 of the partner routing engine.

- `margin_floors` table: global default row plus optional corridor rows (direction, currencies, country, method, customer type). `action` is `warn`, `uplift` or `block`. Restricted to `is_pricing_manager()`.
- Floor basis is profit ÷ transaction amount (same basis as the alert scan), not profit ÷ revenue.
- `applyMarginFloor()` in `_shared/routingEngine.ts` runs after scoring in `routeResolver.ts`: `uplift` raises customer revenue by the shortfall and records `revenue_uplift`; `block` drops the candidate into `excluded` so the dispatcher fails over.
- `pricing_recommendations(p_from, p_to, p_target_margin)` compares revenue against approved billed cost (falls back to modelled cost when no invoice line) and returns the customer percentage fee needed to hit the target margin.
- Alert type `margin_block` in `partner-alerts-scan` aggregates blocked candidates and uplifted quotes per corridor.
- UI: Settings → Partners & Routing → **Guardrails** and **Recommendations** tabs.
