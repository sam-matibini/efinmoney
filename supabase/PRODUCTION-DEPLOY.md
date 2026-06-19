# Supabase production deploy — eFinMoney

**Project:** `dkdnwumllibwdlqbjkwy`  
**Dashboard:** https://supabase.com/dashboard/project/dkdnwumllibwdlqbjkwy

---

## Quick path (project owner)

From a machine logged into the Supabase account that **owns** this project:

```powershell
cd efinmoney-d4767097
npx supabase login
.\supabase\scripts\Deploy-Production.ps1
```

That pushes secrets, deploys critical edge functions (with `verify_jwt` from `config.toml`), and runs pending migrations.

If you only need one step:

```powershell
.\supabase\scripts\Deploy-Production.ps1 -SecretsOnly
.\supabase\scripts\Deploy-Production.ps1 -FunctionsOnly
.\supabase\scripts\Deploy-Production.ps1 -DbOnly
```

---

## Manual dashboard steps (required once)

### 1. SQL Editor

Open **SQL Editor** → New query → paste contents of:

`supabase/production-sql.sql`

Run it. This fixes staff invite welcome emails and ensures trigger email URLs point at the correct project.

### 2. Edge function secrets

**Project Settings → Edge Functions → Secrets**

Ensure these exist (values in `migration-export/secrets.env`):

| Secret | Used for |
|--------|----------|
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_PUBLISHABLE_KEY` | Returned to browser |
| `STRIPE_WEBHOOK_SECRET` | `/stripe-webhook` |
| `STRIPE_PAYOUT_WEBHOOK_SECRET` | `/stripe-payout-webhook` |
| `STRIPE_PAYIN_WEBHOOK_SECRET` | `/stripe-payin-webhook` |
| `PLAID_CLIENT_ID` | Bank linking |
| `PLAID_SECRET` | Must match `PLAID_ENV` (sandbox vs production) |
| `PLAID_ENV` | `sandbox` or `production` |
| `RESEND_API_KEY` | All transactional email |
| `SEND_EMAIL_HOOK_SECRET` | Auth Send Email hook (from Auth → Hooks) |
| `APP_URL` | `https://efin.money` (staff invite redirects) |
| `ADYEN_*` | Wallet top-up via Adyen |

### 3. Verify JWT = OFF (browser-called functions)

**Edge Functions → [function] → Details → Verify JWT with legacy secret = OFF**

These **must** be OFF or browsers get CORS/preflight failures:

- `stripe-payment-intent`
- `stripe-create-checkout-session`
- `stripe-save-card`, `stripe-save-card-confirm`
- `stripe-charge-saved-card`, `stripe-charge-card`
- `plaid-create-link-token`, `plaid-exchange-token`
- `intra-ca-transfer-create`
- `admin-invite-staff`
- `auth-send-email` (auth hook only — no browser CORS)
- `adyen-create-session`, `adyen-confirm-session`
- `adyen-webhook` (Adyen has no JWT)

Webhooks (Stripe, Flutterwave, Adyen, etc.) should also have JWT verification **OFF**.

Each function still validates the user JWT **inside** the function code where needed.

### 4. Redeploy updated functions

If you cannot run the PowerShell script, open each function in the dashboard editor and paste the latest code from the repo, then **Deploy**:

Priority (recent fixes):

1. `stripe-payment-intent`
2. `stripe-create-checkout-session`
3. `plaid-create-link-token`
4. `plaid-exchange-token`
5. `auth-send-email`
6. `admin-invite-staff`
7. `send-email`
8. `adyen-confirm-session`
9. `adyen-webhook`
10. `adyen-create-session`

### 5. Authentication → URL Configuration

**Site URL:** `https://efin.money`

**Redirect URLs** (add all):

```
https://efin.money/**
https://www.efin.money/**
http://localhost:8080/**
https://efin.money/auth/confirm
https://www.efin.money/auth/confirm
https://efin.money/admin/onboarding
https://www.efin.money/admin/onboarding
```

### 6. Authentication → Hooks → Send Email

- **Enabled:** Yes
- **URL:** `https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/auth-send-email`
- Copy the **hook secret** → set as edge secret `SEND_EMAIL_HOOK_SECRET`

### 7. Stripe webhook URLs (Stripe Dashboard)

| Stripe endpoint | Supabase function |
|-----------------|-------------------|
| Payment events | `https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/stripe-webhook` |
| Connect payouts | `.../stripe-payout-webhook` |
| Pay-in | `.../stripe-payin-webhook` |

### 8. Adyen webhook

`https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/adyen-webhook`  
JWT verification must be **OFF**.

### 9. Vercel (frontend)

Add env var and redeploy:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...   # from secrets.env
VITE_APP_URL=https://efin.money
```

---

## Verify after deploy

| Test | Expected |
|------|----------|
| `/wallet/topup` on efin.money | Stripe form loads (no CORS error) |
| Send → Link bank account | Plaid modal opens |
| Admin → Invite staff | Email says "admin portal", link works |
| Adyen top-up test | Wallet credits after payment |

### Smoke-test Stripe key endpoint

```bash
curl -s "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/stripe-payment-intent?action=publishable_key" \
  -H "apikey: YOUR_ANON_KEY"
```

Should return `{"publishableKey":"pk_live_..."}` — not a CORS or 401 error.

---

## Troubleshooting

**403 from Supabase CLI**  
Your logged-in Supabase account does not own `dkdnwumllibwdlqbjkwy`. Run `npx supabase login` with the owner account (eFintax org), or use the dashboard steps above.

**CORS on stripe-payment-intent**  
Turn off **Verify JWT** for that function and redeploy.

**Plaid "invalid credentials"**  
`PLAID_SECRET` must match `PLAID_ENV` (sandbox secret + `PLAID_ENV=sandbox`).

**Staff gets consumer welcome email**  
Run `production-sql.sql` and re-invite the staff member.
