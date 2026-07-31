## Phase 9 — Partner Statement Ingestion & Billed-Cost Reporting

Phase 8 closed the invoice → approval → payables → settlement loop. Two gaps remain before the cost side runs on its own:

1. Invoices can only enter the system through a raw JSON call to `partner-invoice-reconcile` — there is no way for an ops user to load a partner statement file. Lines also only match when the partner happens to send our `transfer_id`; real statements carry the partner's own reference.
2. The Profitability panel still shows only modelled cost from `transaction_economics`; the actual approved billed cost from Phase 8 invoices is never surfaced next to it (the last item of the Phase 8 plan).

### What gets built

**1. Statement upload with column mapping**
- New "Upload statement" dialog in the Cost assurance tab: pick partner, invoice number, period, currency, drop a CSV.
- Parse the header client-side, let the user map each partner column to our fields (`partner_reference`, `transfer_id`, `transaction_date`, `currency_code`, `amount`, `billed_fee`), remember the mapping per partner so the next upload is one click.
- Preview the first rows and the parsed totals before submitting to `partner-invoice-reconcile`.
- Saved mapping stored on the partner record (a `statement_mapping` JSON column) so nothing new is hardcoded.

**2. Reference-based line matching**
- Extend `partner-invoice-reconcile` matching: when a line has no `transfer_id`, resolve it via the partner reference against `routing_attempts.partner_reference` / `transfers.provider_reference`, then fall back to a date + amount + currency window match.
- Record on each line how it was matched (`match_method`: `transfer_id`, `reference`, `heuristic`, `unmatched`) so ops can see match quality, and show a match-rate figure on the invoice.

**3. Actual billed cost in Profitability**
- New SQL function returning approved billed cost per profitability group (partner / corridor / currency / method) over the same window.
- Profitability table gains "Billed cost" and "Billed vs modelled" columns, with the blended margin recalculated on billed cost where an approved invoice covers the period.

**4. Payables aging & partner statement of account**
- Aging buckets (current / 30 / 60 / 90+) on the Settlements tab, per partner and currency.
- Per-partner statement view: invoices, approvals, disputes, settlements and outstanding balance in one list, exportable to CSV.

### Technical details

- Migration: `partner_invoice_lines.match_method` (text) and `match_reference` (text); `payment_partners.statement_mapping` (jsonb, default `{}`); new function `billed_cost_summary(p_from, p_to, p_group_by)` returning group key + approved billed total, security definer, restricted to `is_pricing_manager()`.
- Edge function: extend `partner-invoice-reconcile` only — no new function. Matching order is deterministic (id → reference → date/amount window) and every fallback is recorded, never silently assumed.
- Frontend: CSV parsing reuses the existing pricing import helper pattern in `NetworkActivationPanel`; new `StatementUploadDialog.tsx` under `src/components/settings/partners/`; hooks added to `useCostAssurance.tsx`; Profitability columns from a new `useBilledCost` hook in `useProfitability.tsx`; aging + statement views added to `PartnerSettlementsPanel.tsx`.
- All figures derive from invoice lines, economics rows or ledger balances — no hardcoded amounts, and the double-entry posting from Phase 8 is untouched.
