---
name: Live partner pricing
description: How partner FX spreads and billed costs are pulled live (partner-rates-refresh, observed costs, drift) and how routing consumes them
type: feature
---
Partner economics are no longer purely static rate cards.

**Live FX (Phase 1)** — `partner-rates-refresh` edge function sweeps enabled cross-currency `partner_corridors`, quotes each pair through `_shared/partnerQuotes.ts` adapters (Wise, Flutterwave, Nomba today; others reported as `skipped_partners`) and appends rows to `partner_fx_rates` with `source = 'api'`, a 15-minute `expires_at`, and the spread computed against our mid-market snapshot.
- Runs on pg_cron every 15 min, plus "Refresh live rates" in Settings → Partners & Routing → Partner FX Rates (`useRefreshPartnerLiveRates`).
- Callable without a session (project convention) but throttled: a sweep inside 4 minutes returns `throttled: true`. `PARTNER_RATES_CRON_SECRET` in `x-internal-secret` forces a sweep.

**Routing (Phase 3)** — `_shared/routeResolver.ts` overrides `pricing.fx_markup_bps` with the freshest non-expired `source='api'` spread, clamped at >= 0. Fees always stay contract-driven, and an expired/absent live quote silently degrades to the rate card.

**Observed cost (Phase 2)** — `_shared/observedPartnerCost.ts` `recordObservedPartnerCost()` logs what a partner actually billed into `partner_observed_costs` (idempotent on `partner_id + provider_reference`), computes drift on fee + FX combined, and never throws. Wired into `flutterwave-webhook` on completed payouts; add further providers the same way. View `partner_cost_drift` summarises 90-day averages and powers the "Billed drift" column in Partner Pricing (red above +2%).
