## Adyen Integration Plan (Test/Sandbox)

Adds Adyen as a card & APM acquirer covering Visa, Mastercard, Amex, Alipay, and Interac Card, plus Pay by Link. Settles to user wallets via the existing double-entry ledger with auto-FX into the user's default currency.

### 1. Secrets (you add via secure form)
- `ADYEN_API_KEY` — server API key (test)
- `ADYEN_MERCHANT_ACCOUNT` — test merchant account code
- `ADYEN_CLIENT_KEY` — public client key for Drop-in
- `ADYEN_HMAC_KEY` — webhook HMAC signature key
- `ADYEN_ENV` = `test`
- `ADYEN_LIVE_URL_PREFIX` (optional, ignored in test)

### 2. Database (one migration)
New tables (all RLS-protected, with GRANTs):
- `adyen_payment_sessions` — id, user_id, purpose (`wallet_topup`|`transfer_funding`|`invoice`|`admin_link`), reference, psp_reference, amount_minor, currency, target_wallet_id, target_currency, status (`pending`/`authorised`/`settled`/`refused`/`refunded`/`cancelled`), payment_method, raw_session jsonb, return_url, created_at/updated_at
- `adyen_pay_by_link` — id, owner_user_id, link_id, url, reference, amount_minor, currency, purpose, sales_invoice_id (nullable FK), expires_at, status, created_at
- `adyen_webhook_events` — id, event_code, psp_reference, merchant_reference, success, raw jsonb, hmac_valid, processed_at

Wallet credits go through existing ledger pattern (liability 21xx credited, asset 11xx Adyen settlement clearing account debited). Adds COA account `1108 — Adyen Settlement Clearing` per currency.

### 3. Edge functions
- `adyen-create-session` — Drop-in `/sessions` call; validates auth, amount, target wallet ownership; rate-limited; returns session data + clientKey.
- `adyen-create-paylink` — `/paymentLinks` for invoices/admin; admin scope required for `admin_link`; saves to `adyen_pay_by_link`; returns shortened `efin.money/s/<code>` link.
- `adyen-webhook` — verifies HMAC, idempotent on `pspReference`+`eventCode`, handles `AUTHORISATION`, `CAPTURE`, `REFUND`, `CANCELLATION`, `CHARGEBACK`. On success: credits ledger, runs FX swap into user's default wallet if currencies differ, updates session/invoice, sends notification + receipt.
- `adyen-payment-details` — for redirect/3DS return.

All functions use `verify_jwt=false` only where Adyen calls back; user-facing ones validate `auth.uid()`.

### 4. Frontend
- `src/lib/adyen.ts` — wrapper to invoke edge functions, mount Drop-in.
- `AdyenDropIn` component (using `@adyen/adyen-web`) — handles card (Visa/MC/Amex), Alipay, Interac Card via configured payment methods response.
- **Wallet top-up**: new "Card / Alipay / Interac" option on `/wallets` Top Up sheet → opens Drop-in modal → on success shows pending state, ledger update arrives via webhook + realtime.
- **Send / Exchange funding**: add Adyen as a `funding_source` choice alongside wallet; on submit, creates session for `source_amount + fee`, then queues transfer to execute after webhook settlement.
- **Sales invoices**: "Generate Pay Link" button on invoice detail → calls `adyen-create-paylink`, displays + copies short URL, attaches to invoice.
- **Admin**: `/admin/payments/adyen` — list links & sessions, create ad-hoc link, view webhook log.

### 5. Settings
`/settings → Payments → Adyen` panel:
- Shows test mode badge, enabled methods toggles (Visa, MC, Amex, Alipay, Interac), supported currencies, link expiry default.
- Stored in `integration_settings` (`provider='adyen'`).

### 6. FX & ledger flow on settlement
1. Webhook authorised+captured → insert ledger journal:
   - DR `1108 Adyen Settlement Clearing` (settlement currency)
   - CR user wallet liability (settlement currency)
2. If settlement currency ≠ user default wallet currency → call existing `execute_fx_swap` with markup from `pricing_config`.
3. Mark `adyen_payment_sessions.status='settled'`, notify user, trigger receipt PDF.

### 7. Security
- HMAC verification mandatory; reject on mismatch.
- All session creation rate-limited via `check_rate_limit` (10/min per user).
- Amount bounds enforced against user's KYC tier limits.
- Idempotency on `pspReference` to prevent double-credit.
- No card data ever touches our servers (Drop-in tokenises client-side).

### 8. Out of scope (this phase)
- Payouts via Adyen (we already use Stripe/Paysafe/PawaPay/Circle).
- Recurring tokenisation / saved cards (can add later via `storePaymentMethod`).
- Live mode credentials (test only now; live = secret swap + `ADYEN_ENV=live`).

### Deliverables checklist
- [ ] Migration with 3 tables + COA accounts + GRANTs + RLS
- [ ] 4 edge functions
- [ ] `@adyen/adyen-web` dependency + Drop-in component
- [ ] Top-up, Send funding, Invoice paylink, Admin link UIs
- [ ] Settings panel + memory file `mem://features/adyen-payments`
