---
name: Adyen Payments
description: Adyen Drop-in pay-in (Visa/MC/Amex/Alipay/Interac) and Pay-by-Link with ledger settlement and auto-FX
type: feature
---
Adyen integrated in test mode for pay-in and hosted Pay by Link.

Methods enabled: scheme (Visa, Mastercard, Amex), alipay, interac_card.

Tables:
- `adyen_payment_sessions` — Drop-in checkout sessions
- `adyen_pay_by_link` — hosted payment links (linked to short_links via short_code)
- `adyen_webhook_events` — idempotency log keyed by (psp_reference, event_code)

Edge functions:
- `adyen-create-session` — POST /sessions, auth-required, rate-limited 10/min, validates wallet ownership
- `adyen-create-paylink` — POST /paymentLinks, returns short URL via create_short_link RPC
- `adyen-webhook` — HMAC verification (ADYEN_HMAC_KEY hex-decoded), idempotent insert, credits ledger on AUTHORISATION+success or CAPTURE, runs execute_fx_swap when target_currency differs
- `adyen-modify-payment` — admin-only (has_role 'admin'), POST /payments/{pspReference}/{captures|cancels|refunds} by action: capture/cancel/refund. Final status still lands via adyen-webhook.

Ledger: DR `1108 Adyen Settlement Clearing` (per currency) / CR liability `21xx`. New COA accounts 1108 for USD/CAD/EUR/GBP.

Secrets: ADYEN_API_KEY, ADYEN_MERCHANT_ACCOUNT, ADYEN_CLIENT_KEY, ADYEN_HMAC_KEY, ADYEN_ENV.

Webhook URL to register in Adyen Customer Area: `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/adyen-webhook` (HMAC standard webhook, hex key).

Frontend:
- `src/lib/adyen.ts` — createAdyenSession, createAdyenPayLink, modifyAdyenPayment
- `src/components/payments/AdyenDropIn.tsx` — @adyen/adyen-web v6 (uses `new Dropin(checkout, opts)`)
- `src/components/payments/AdyenTopUpCard.tsx` — embedded on /wallets/topup for any supported currency
- `/admin/payments/adyen` — admin pay-by-link generator + listing
- `/admin/payments/adyen/transactions` — admin-only capture/cancel/refund on authorised test payments (used to satisfy Adyen's "Test your integration" checklist)
