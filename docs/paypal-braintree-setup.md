# PayPal wallet top-up (no Braintree)

Uses **PayPal Developer Client ID + Secret** and Orders API.  
Braintree (cards/Venmo in one gateway) can be added later — see `_shared/braintree.ts`.

## 1. Get credentials

1. Open [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox)
2. Toggle **Sandbox** (test) or **Live**
3. **Apps & Credentials** → your app (or create one)
4. Copy **Client ID** and **Secret**

## 2. Supabase secrets (project owner)

```bash
npx supabase secrets set \
  PAYPAL_CLIENT_ID="..." \
  PAYPAL_CLIENT_SECRET="..." \
  PAYPAL_ENVIRONMENT="sandbox" \
  --project-ref dkdnwumllibwdlqbjkwy
```

Live: `PAYPAL_ENVIRONMENT=live` + Live Client ID/Secret.

## 3. Migration + deploy

```bash
npx supabase db query --linked --yes -f supabase/migrations/20260807010000_paypal_settlement_accounts.sql
npx supabase functions deploy paypal-public-config paypal-create-order paypal-capture-order --project-ref dkdnwumllibwdlqbjkwy
```

Ledger: **1370–1373** PayPal Settlement USD/CAD/EUR/GBP.

## 4. Test

1. Top Up → CAD → **PayPal**
2. Sandbox buyer: [Sandbox accounts](https://developer.paypal.com/dashboard/accounts)
3. Pay CA$5 → wallet credits (`paypal_topup`)
