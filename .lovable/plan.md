## Goal

Expand the "Add New Card" flow on `/cards` to match the eFinMoney issuance guide: support new card types (Debit, Debit Visa, Credit Card), generate full card details (number, expiry, CVV), and enforce wallet-based controls.

## Changes

### 1. Database (migration)
- Extend `cards.card_type` CHECK constraint to allow: `virtual`, `physical`, `debit`, `debit_visa`, `credit`.
- Add columns:
  - `card_number_last16 text` — full 16-digit PAN (display masked except for the owner; we already RLS-restrict to `auth.uid() = user_id`).
  - `cvv text` — 3-digit code.
  - `expiry_month int`, `expiry_year int` (kept alongside existing `expires_at` for clean MM/YY formatting).
  - `funding_source text` — `wallet` for debit/debit_visa, `credit_line` for credit.
  - `credit_limit numeric` — nullable, used when type = `credit`.
- Keep RLS as-is (owner-only read). No change to admin policy.

### 2. Hook (`src/hooks/useCards.tsx`)
- Update `Card` interface with new fields.
- In `createCard`:
  - Generate a realistic 16-digit PAN with network-specific BIN prefix (Visa `4`, Mastercard `5`) + Luhn check digit.
  - Generate random 3-digit CVV.
  - Compute expiry MM/YY (today + 4 years).
  - Validate: for `debit`/`debit_visa`, `wallet_id` is required and wallet balance must be > 0 (read via existing `wallets` query).
  - For `credit`, require `credit_limit`.

### 3. UI (`src/components/modals/AddCardModal.tsx`)
- Replace Card Type options with: Debit, Debit Visa, Credit Card (drop legacy virtual/physical from the picker but keep them valid in DB for backward compatibility).
- Conditional fields:
  - Debit / Debit Visa → require Linked Wallet; show wallet balance hint.
  - Credit Card → hide Linked Wallet, show "Credit Limit" instead of (or alongside) Spending Limit.
- Show a review summary block before the Create button (cardholder, type, network, wallet/credit, limit).
- After creation, show a success state revealing the generated card number, expiry, and CVV with a copy button and a "Done" action. Numbers are masked by default with reveal toggle (already present pattern on `CardsPage`).

### 4. Cards display (`src/pages/CardsPage.tsx`)
- Use the stored full PAN (when revealed) instead of the hard-coded `4532 1234 5678 ····`.
- Use stored MM/YY when present; fall back to `expires_at`.
- Render new card-type labels (Debit / Debit Visa / Credit) in the badge.

### 5. Internal controls (client-side checks before submit)
- Block submit with toast if: wallet not selected for debit types, wallet balance is zero, credit limit missing for credit type, or cardholder name is empty.

## Out of scope
- No real card issuer integration (Stripe Issuing, Marqeta, etc.). PAN/CVV are generated locally for prototype/demo purposes — same approach already used for `last_four`.
- No changes to freeze/edit/delete flows.

## Technical notes
- Luhn generator + Visa/Mastercard BIN logic added inline in `useCards.tsx`.
- `funding_source` defaults to `wallet` so existing rows stay valid.
- New CHECK constraint replaces the old one in a single migration.
