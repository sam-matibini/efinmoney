## Phase 7 — Partner Settlement, Invoice Ingestion & Margin Alerting

Phases 1-6 delivered partners, corridors, pricing, FX, liquidity, routing (shadow → live → failover), profitability, readiness, cost assurance and network activation. Three gaps remain in the original spec:

1. Partner invoices can be reconciled (`partner-invoice-reconcile` exists, `useCostAssurance` reads `partner_invoices`) but there is **no way to get invoices into the system** — no upload/ingestion UI.
2. `partner_limits` is read by the route resolver but has **no management UI**, so limits can only be edited in the database.
3. Profitability and readiness are pull-only dashboards — nothing proactively raises an alert when margin collapses, a corridor goes unready, or liquidity runs low.

### What gets built

**A. Partner invoice ingestion**
- New `PartnerInvoicesPanel.tsx` (tab "Invoices" in Partners & Routing): list invoices by partner/period with status, billed vs expected totals and variance.
- CSV/JSON upload dialog: pick partner + period, paste or upload a line file (external reference, corridor, amount, currency, fee, fx cost). Rows land in `partner_invoices` + `partner_invoice_lines`.
- "Reconcile" action per invoice calls the existing `partner-invoice-reconcile` function and shows matched / unmatched / missing lines with drill-down to the underlying `transaction_economics` rows.

**B. Partner limits management**
- New `PartnerLimitsPanel.tsx` (tab "Limits"): CRUD over `partner_limits` per partner/corridor — min/max per transaction, daily and monthly caps, currency.
- Live usage bar per limit computed from transfers in the period, so operators see headroom before routing blocks a partner.

**C. Margin & health alerting**
- New edge function `partner-alerts-scan` (hourly cron, alongside the existing health/liquidity crons) that evaluates:
  - corridor margin below a configured floor over the trailing window,
  - negative-profit transactions,
  - pricing coverage gaps with material volume,
  - corridors flipped to not-ready or liquidity stale/low.
- Findings are written to `compliance_alerts` (existing alert store, severity-tagged) so they surface in the Operations dashboard, and summarised in a new "Alerts" section on the Profitability panel with acknowledge/resolve.
- Thresholds stored in `pricing_config` so no values are hardcoded.

### Technical notes
- Reuses existing hooks pattern (`usePartnerNetwork`, `useCostAssurance`); adds `usePartnerLimits` and extends `useCostAssurance` with invoice-create mutations.
- No new tables required for A and B (`partner_invoices`, `partner_invoice_lines`, `partner_limits` already exist); a migration adds the alert threshold defaults and, if needed, an alert-type value for margin alerts.
- Cron scheduling follows the same `pg_cron` + `net.http_post` pattern used for `routing-health-check`.
- Access stays restricted to pricing managers / admins via the existing `is_pricing_manager` / `is_admin_user` checks.
