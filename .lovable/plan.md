## Phase 8 — Partner Settlement, Payables & GL Posting

Phases 1–7 gave us pricing, routing, profitability, readiness, seeding, limits, alerts and invoice reconciliation. Today a reconciled partner invoice stops at a variance report: `partner_invoices` only has `draft`/`reconciled` status, no vendor link, no approval or dispute trail, and no accounting entry — partner cost never reaches the ledger, so the P&L understates network fees. Phase 8 closes that loop.

### What gets built

**1. Approve → dispute → settle workflow**
- Invoice statuses: `draft → reconciled → disputed → approved → paid` (plus `void`).
- Line-level dispute flag with a reason, so an invoice can be part-approved: approved lines post, disputed lines are held and rolled into a credit expectation.
- Dispute summary per partner, feeding a new `invoice_dispute` alert type in the Phase 7 alerts panel.

**2. Partner payables in the ledger**
- New liability accounts `2210 Partner Payables` (per settlement currency, created on demand like the FX clearing accounts).
- On approval, post a balanced journal: DR `5300 Network Fees` for the approved billed total, CR `2210 Partner Payables`. Variance between billed and expected is posted to Network Fees as well (it is a real cost), and recorded on the invoice so Profitability can show billed-vs-forecast drift.
- On settlement payment, post DR `2210 Partner Payables` / CR the settlement wallet or bank clearing account.
- Journals reuse the existing `ledger_entries` + `journal_id` pattern and respect the `enforce_journal_currency_balance` trigger — one journal per currency, no cross-currency legs.

**3. Settlement runs**
- New `partner_settlements` table: partner, period, currency, invoice set, total due, amount paid, payment method/reference, status, journal id.
- A settlement groups one or more approved invoices and records the actual outward payment (bank transfer, wallet debit, or manual).

**4. UI — new "Settlements" tab in Partners & Routing**
- Invoice queue with variance, dispute count and one-click Approve / Dispute / Void.
- Line drill-down (existing dialog) gains per-line dispute toggles.
- Settlement builder: pick partner + currency, select approved invoices, record payment, see the resulting journal reference.
- Aging view: outstanding payables by partner and currency.

**5. Reporting tie-in**
- Profitability panel gains an "actual billed cost" column sourced from approved invoices, next to the modelled cost already tracked in `transaction_economics`.

### Technical details

- Migration: extend `partner_invoices` (`vendor_id`, `approved_by`, `approved_at`, `journal_id`, `settlement_id`, `disputed_total`), extend `partner_invoice_lines` (`dispute_status`, `dispute_reason`), create `partner_settlements` with GRANTs to `authenticated`/`service_role`, RLS scoped to `is_pricing_manager()`, and `updated_at` triggers — matching the existing partner tables.
- Helper `ensure_partner_payable_account(currency)` mirroring `ensure_fx_clearing_account`.
- Edge functions: `partner-invoice-approve` (validates, posts the expense journal) and `partner-settlement-pay` (posts the payment journal, marks invoices paid). Both service-role, JWT validated in code, role-checked against `is_pricing_manager`.
- Hooks in `src/hooks/useCostAssurance.tsx` / `usePartnerOps.tsx`; new `PartnerSettlementsPanel.tsx` wired into `PartnerNetworkPanel.tsx`.
- No hardcoded amounts: every posted figure comes from invoice lines or the settlement record.
