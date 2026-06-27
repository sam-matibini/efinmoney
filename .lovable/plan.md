## Comprehensive Purchases Module

Build a full procure-to-pay suite under Finance Dashboard, with dual-control approvals and multi-rail payouts.

### 1. Database (new + extended tables)

- `vendors` — extend: `tax_id_type` (SIN/BN/EIN), `tax_id`, `is_1099_t4a` bool, `default_expense_account`, `default_payment_method`, `payment_terms_days`, `currency_code`, statement counters.
- `purchase_orders` — id, po_number, vendor_id, status (draft/approved/sent/received/closed/cancelled), subtotal/tax/total, currency, expected_date, notes, created_by, approver_id.
- `purchase_order_items` — po_id, description, qty, unit_price, tax_percent, gl_account_id.
- `purchase_receipts` — po_id, received_at, received_by, notes (for 3-way match).
- `purchase_receipt_items` — receipt_id, po_item_id, qty_received.
- Extend `purchase_bills` — `purchase_order_id` FK, `payment_status` (unpaid/partial/paid), `paid_amount`, `recurring_template_id`.
- `bill_payments` — bill_id, amount, payment_method (wallet/eft/interac/cpn/pawapay/link), wallet_id, rail_reference, journal_id, status, paid_at.
- `recurring_bill_templates` — vendor_id, frequency (weekly/monthly/quarterly/yearly), next_run_at, day_of_month, amount, gl_account_id, active, end_date.
- `expense_claims` — submitter_user_id, status (draft/submitted/approved/rejected/reimbursed), total, currency, submitted_at, approved_by, reimbursement_journal_id.
- `expense_claim_items` — claim_id, date, merchant, category, gl_account_id, amount, tax_amount, receipt_url, scanned_data jsonb.
- `tax_form_summaries` (year-end T4A/1099) — vendor_id, tax_year, total_paid, form_type, status.

All tables: GRANTs for `authenticated` (own/admin scoped) + `service_role`; RLS via `has_role('admin')` / `has_role('finance')` + ownership; `updated_at` triggers.

### 2. Edge Functions

- `purchase-order-create` — generates PO #, posts no ledger entry until receipt.
- `purchase-order-approve` — writes to `maker_checker_requests` with action `po_approve`.
- `purchase-receipt-record` — receives goods, triggers 3-way match check vs bill.
- `bill-pay` — debits AP (2110), credits cash/wallet liability or escrow; routes via:
  - **wallet**: direct ledger swap
  - **interac/eft**: calls existing `paysafe-payout`
  - **cpn**: calls `circle-cpn-payout`
  - **pawapay**: calls `pawapay-payout`
  - **link**: calls `payment-link-create` with preset payload (vendor email)
- `bill-pay-approve` — maker-checker dual control for any bill ≥ threshold (configurable, default $1,000).
- `recurring-bills-run` — pg_cron hourly; generates draft bills from due templates.
- `expense-claim-submit` / `expense-claim-approve` / `expense-claim-reimburse` — posts to 5xxx expense + AP; reimbursement debits AP, credits wallet.
- `scan-receipt` — reuse existing `scan-purchase-bill` for expense receipts.
- `tax-form-generate` — aggregates yearly vendor payments, marks `is_1099_t4a` vendors for T4A/1099-NEC.

### 3. Frontend (under FinanceDashboard → new "Purchases" tab group)

New panels in `src/components/finance/purchases/`:
- `VendorsDirectoryPanel.tsx` — extends existing VendorsPanel with tax ID, T4A toggle, statement view, ageing.
- `PurchaseOrdersPanel.tsx` — list, create modal, approval queue, send to vendor (email/link).
- `PurchaseReceiptsPanel.tsx` — receive goods against PO; 3-way match indicator.
- `PurchaseBillsPanel.tsx` — extended: link to PO, "Pay" button opens `PayBillModal` (rail selector), batch pay.
- `RecurringBillsPanel.tsx` — manage templates, preview next runs.
- `ExpenseClaimsPanel.tsx` — submit (with scanner), approve queue, reimburse.
- `TaxFormsPanel.tsx` — yearly T4A/1099 generator + CSV export.

New page route: `/finance/purchases` (tabs: Vendors · POs · Receipts · Bills · Recurring · Expenses · Tax Forms). Existing `PurchaseBillsPanel` stays usable from current Finance tab.

### 4. Approvals (Maker-Checker)

All POs over threshold, all bill payments over threshold, and all expense reimbursements flow through `maker_checker_requests` with action types `po_approve`, `bill_pay_approve`, `expense_reimburse_approve`. Checker uses existing `MakerCheckerPanel` in Operations.

### 5. Ledger Postings (double-entry)

| Event | Debit | Credit |
|---|---|---|
| Bill created | 5xxx Expense / 1xxx Asset | 2110 Accounts Payable |
| Bill paid (wallet) | 2110 AP | 2100 Customer Liability (wallet) |
| Bill paid (rail) | 2110 AP | 1207 Settlement-in-flight |
| Expense claim approved | 5xxx Expense | 2110 AP (employee) |
| Reimbursement | 2110 AP | 2100 Wallet |
| Tax (GST/HST input) | 1310 Input Tax Credit | included in AP |

### 6. Notifications

In-app notifications on: PO approval needed, bill due in 3 days, expense claim status change, recurring bill generated.

### Out of scope (this iteration)

- Vendor self-service portal (could reuse `customer-portal-access` pattern later)
- OCR of multi-page POs (single-page receipts only via existing scanner)
- Foreign-currency revaluation on AP (use spot rate at bill date)
