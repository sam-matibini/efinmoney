## Scope

Extend the Purchases module with subcontractor tracking (T4A), a dedicated "Add Expense" entry point, document attachments on expenses & POs, and a complete payment-method set on the Pay Bills dialog.

---

## 1. Subcontractors & T4A tracking (Vendors)

**DB migration**
- `vendors`: add `is_subcontractor boolean default false`, `t4a_eligible boolean default false`, `sin_or_bn text` (encrypted/masked), `business_legal_name text`, `service_type text` (e.g. construction, professional fees), `cra_t4a_box text` (default `048` – fees for services).
- New table `t4a_ytd_totals` (vendor_id, tax_year, box_code, gross_paid, taxes_withheld) — populated by a trigger when `vendor_bill_payments.status = 'completed'` AND vendor is T4A-eligible.

**UI – `VendorsPanel.tsx`**
- Add a "Type" select: Supplier / Subcontractor / Employee-contractor.
- When Subcontractor is chosen, reveal T4A fields (Legal name, SIN/BN, Service type, T4A box, eligible toggle).
- Add a "Subcontractors" filter chip and a new column "YTD T4A $".
- New page `src/pages/admin/T4AReportPage.tsx` (linked from Finance → Reports) listing vendors with YTD totals, "Generate T4A slips" export (CSV first, PDF later).

---

## 2. "Add Expense" in Purchases

**UI**
- In `FinanceDashboard.tsx` Purchases tab, add a top-level **+ Add Expense** button (next to existing Add PO / Add Bill).
- New `QuickExpenseDialog.tsx` for fast one-off expenses (no PO/bill flow): vendor picker (or "Cash payee"), date, GL account, amount, tax, payment source (wallet/card/cash/reimbursable), receipt upload.
- Behind the scenes:
  - If paid from wallet/card → posts ledger DR Expense / CR Wallet immediately.
  - If "reimbursable" → creates an `expense_claims` row in Draft state pre-filled for the current user.

---

## 3. Documents on Expenses & Purchase Orders

**Storage**
- Create private bucket `purchase-documents` (RLS: owner can read/write; finance role read-all).

**DB migration**
- New table `purchase_attachments` (id, parent_type enum: `bill | po | expense_claim | expense_item | grn`, parent_id uuid, file_path, file_name, mime_type, size_bytes, uploaded_by, created_at).

**UI**
- Shared `<AttachmentsPanel parentType parentId />` component (drag-drop + list + preview + delete).
- Mount inside:
  - `PurchaseOrdersPanel.tsx` PO detail view
  - `ExpenseClaimsPanel.tsx` claim detail + per-line attachment icon
  - `QuickExpenseDialog.tsx` (single receipt slot, reuses scanner from existing PurchaseBillsPanel)
- Reuse `scan-purchase-bill` edge function to auto-fill amount/vendor/tax on upload.

---

## 4. Complete payment methods in `PayBillDialog.tsx`

Today: wallet, EFT, Interac, CPN, PawaPay, Link, manual.

Add and wire to existing edge functions:
- **Credit/Debit Card** (Adyen Drop-in for AP card payments via `adyen-create-session`).
- **Saved card on file** (uses `saved_payment_methods`).
- **Stellar / USDC** (`send-stellar` for crypto-rail vendors).
- **M-Pesa B2B** (`mpesa-payout`).
- **Flutterwave** (already wired for African rails).
- **Cheque / Cash** (manual posting with cheque #, no rail call).
- **Bank wire (SWIFT)** for non-CA international vendors.

Each method gets its required fields (card form, mobile #, wallet address, cheque #) rendered conditionally. The `vendor-bill-pay` edge function gains a `payment_method` switch dispatching to the right provider; ledger posting (DR `2400` AP / CR settlement account) stays unchanged. Maker-checker ($1,000) threshold still applies.

---

## Technical notes

- All new tables get GRANTs to `authenticated` + `service_role`, RLS scoped to owner + finance role.
- T4A YTD totals use a `SECURITY DEFINER` trigger on `vendor_bill_payments` to avoid double-counting on partial payments.
- Storage RLS restricts `purchase-documents` reads to the uploader and users with `finance`/`admin` role.
- No changes to existing payment-link or expense-claim flows beyond adding the attachments panel.

---

## Out of scope (ask before adding)
- Auto-filing T4A XML to CRA (export only, no submission).
- 1099 (US) equivalent.
- OCR-based line-item splitting for expenses (scanner currently fills header only).