# Payment Links + Payee Directory Upgrade

Three related improvements to the Send / Payment-Link flow.

## 1. Payment Links management (status visibility)

Today senders can create payment links but have no place to see them. When a link is reused they only see the "Link Claimed" screen, so they assume the system is broken.

**Add** `src/pages/PaymentLinksPage.tsx` at route `/payment-links`:
- Lists all `payment_link_payouts` for the logged-in sender (newest first).
- Columns: recipient, amount, status badge (`pending` / `claimed` / `expired` / `revoked` / `failed`), method used, claimed-at, expires-at, short link.
- Row actions: Copy link, Resend (email/SMS), Revoke (calls existing `payment-link-revoke` — pending only), View claim details (method, masked payout destination, transfer id).
- Filters: status tabs (All / Pending / Claimed / Expired) + search by recipient/note.
- Add entry point from `SendPage` ("My payment links") and from the dashboard Quick Actions.

**Update** `ClaimPaymentLinkPage.tsx`:
- Replace the generic "Link Claimed" copy with a clearer status card that distinguishes `claimed` ("Already paid to <recipient> on <date> via <method>"), `expired`, and `revoked`. Same component for all terminal states with the right icon + message.

No DB migration needed — `status`, `claimed_at`, `claimed_method` already exist.

## 2. Preloaded EFT details → auto-credit

Let the sender attach a recipient's EFT (Canadian bank) details when creating the link. If present, the claim page skips the method picker and the payout goes straight to that account via the existing Paysafe EFT path.

**DB migration** — add to `payment_link_payouts`:
- `preset_method text` (`eft` | `interac` | `card` | null)
- `preset_payload jsonb` (encrypted-at-rest by RLS; stores institution, transit, account, account holder name for EFT; email for Interac)
- `auto_claim boolean default false` — when true, claim page requires only recipient confirmation + KYC (no method choice).

**Edge functions**:
- `payment-link-create`: accept `preset_method` + `preset_payload`, validate shape (EFT: 3-digit institution, 5-digit transit, 7–12 digit account; Interac: email).
- `payment-link-resolve`: return `preset_method` (but never the raw payload — only a masked summary like "RBC ••• 1234").
- `payment-link-claim`: when `preset_method` is set, ignore client-supplied destination and use the stored payload; otherwise behave as today.

**UI**:
- `CanadaSendFlow` create-link step: new "Send directly to bank account (EFT)" toggle → reveals institution / transit / account / holder fields, or pick from saved payees (see §3).
- `ClaimPaymentLinkPage`: when `preset_method === "eft"`, show "Funds will be deposited to RBC ••• 1234" and a single Confirm + KYC form, then call claim with `{ method: "preset" }`.

## 3. Payee directory (suppliers, employees, anyone)

Extend the existing `beneficiaries` table instead of adding a new one.

**DB migration** — add columns:
- `category text` check in (`person`, `supplier`, `employee`, `contractor`, `payee`, `other`) default `person`
- `email text`
- `eft_institution text`, `eft_transit text`, `eft_account text`, `eft_account_holder text`
- `interac_email text`
- `notes text`
- `tags text[] default '{}'`

**Page** — upgrade `/contacts` to `/payees` (keep `/contacts` as alias) with:
- Tabs: All / People / Suppliers / Employees / Contractors.
- Add/Edit modal collects category, contact details, and any payout methods (EFT, Interac, mobile money, bank).
- Search by name, email, phone, tag.

**Lookup widget** — `<PayeePicker />`:
- Used by `CanadaSendFlow` (Send and Create-link steps) and the new EFT preset section.
- Typeahead over the payee list; selecting a payee prefills recipient name, email, and (when available) EFT or Interac details and the preset toggle.
- After a successful send, prompt "Save <name> as a payee?" if not already saved (similar to existing auto-save beneficiary behavior).

## Technical notes

- All new tables/columns get `GRANT` + RLS scoped to `auth.uid() = user_id`.
- `preset_payload` and the new payee EFT columns are only readable by the owner; edge functions use service role.
- No new third-party providers — reuses Paysafe EFT / Interac that already power claim.
- Memory updates: `mem://features/payment-link-payouts` (preset + status UI), `mem://features/saved-beneficiaries` (payee categories + EFT/Interac fields).

## Out of scope

- Bulk import of payees (CSV) — can follow later.
- Sending without a payment link (direct EFT) — different flow.
- Cross-currency presets — preset is CAD-only for now (matches existing claim coverage).
