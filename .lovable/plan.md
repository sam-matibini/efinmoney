# Code Review: Pricing — what happened and why it looks different

Report only. No code changes proposed here.

## When the pricing work happened

Two separate builds exist, months apart:

1. **Early build (Jan 2026)** — `PricingSettingsPanel` for the Finance Dashboard (transfer fees, FX markup), plus `pricing_config` key/value settings. A later session (12 May 2026) tuned `transfer_base_fee` to $0.30 via SQL.
2. **The big build (30–31 July 2026)** — "Multi-Pay-In & Pay-Out Partner Pricing, Routing & Profitability Engine", delivered in ~13 approved phases across those two days: partner network schema, cost/profit routing (shadow then live), corridor scorecards, margin guardrails, and automated fee adjustments.

The admin `/admin/pricing` corridor table in your screenshot is the **older, standalone** screen — it was never folded into the July engine.

## What is actually in the project now

The July engine is present and substantial:

- Tables: `payment_partners`, `partner_pricing`, `partner_corridors` (50 rows), `partner_fx_rates`, `partner_limits`, `partner_liquidity`, `partner_scorecards`, `partner_settlements`, `partner_invoices`, `efinmoney_pricing` (10 rows), `margin_floors`, `routing_rules`, `routing_decisions`, `routing_attempts`, `routing_overrides`, `pricing_proposals`, `corridor_forecasts`.
- Edge functions: `price-quote`, `routing-quote`, `pricing-adjust-scan`, `pricing-proposal-apply`, `routing-health-check`, `corridor-forecast-scan`, plus shared `pricingService.ts`, `routingEngine.ts`, `routeResolver.ts`, `pricingProposals.ts`.
- UI: 15 panels under `src/components/settings/partners/` (Partners, Partner Pricing, Corridors, FX Rates, Limits, Liquidity, Settlements, Routing Strategy, Live Routing Control, Cost Assurance, Network Activation, eFin Pricing, Alerts, Incidents) — all mounted under **Settings → "Partners & Routing"**, not under Admin → Pricing.

## The divergence you are seeing

`/admin/pricing` (`src/pages/admin/PricingPage.tsx` + `src/hooks/usePricingRules.tsx`) reads and writes a table called **`pricing_rules`**. That table **does not exist in the current backend** (`to_regclass('public.pricing_rules')` returns null). So in this codebase that page has no data source, while the rate card the payment flows actually price against lives in `efinmoney_pricing` and is edited from Settings → Partners & Routing → eFin Pricing.

The screenshot shows five populated corridors on `efin.money/admin/pricing`, so that deployed build is reading a `pricing_rules` table that exists in whatever backend it points at — not the one this project is connected to now. That is the most likely reason "what I have here is completely different." I have not verified the deployed build's backend, so treat that specific link as unconfirmed.

## Summary of the gap

| Area | Admin → Pricing (screenshot) | Settings → Partners & Routing (July engine) |
| --- | --- | --- |
| Data source | `pricing_rules` (missing here) | `efinmoney_pricing`, `partner_pricing` |
| Scope | Customer fee % / fixed / FX markup / limits / live toggle | Partner cost, customer price, FX margin, routing, margin floors, proposals |
| Used by transfers? | No | Yes — `price-quote` / `resolve_customer_price` |
| Governance | None | Margin guardrails, proposals, approvals, audit |

## Empty tables worth noting

`partner_pricing` (0 rows) and `pricing_proposals` (0 rows) are empty, and `routing_decisions` has 1 row — the routing/profitability side has schema and code but effectively no partner cost data loaded yet, so cost-vs-price margin analysis cannot produce meaningful output as-is.

## Possible next steps (not started)

1. Point `/admin/pricing` at `efinmoney_pricing` so there is one rate card, and retire `usePricingRules`.
2. Or surface the Partners & Routing panels under Admin so pricing lives in one portal.
3. Load partner cost rows into `partner_pricing` to switch the margin and proposal engine on.

Say which of these you want and I will plan it properly.
