## Goal
Switch the Plaid integration on `/transfers/canada` from **Sandbox** to **Production** so real Canadian bank accounts can be linked and debited via Stripe PAD.

## Important warnings before proceeding

1. **Plaid Production access must be approved.** Plaid does not grant Production access by default — you have to request it from your Plaid dashboard (Team Settings → Request Production Access) and Plaid reviews your company, use case, and compliance posture. If your account is not yet approved, the secret will keep returning `INVALID_API_KEYS` no matter what we do in code.
2. **Production credentials are different from Sandbox.** They live under a separate row in https://dashboard.plaid.com/developers/keys with the environment selector set to **Production**. The `client_id` is the same across environments, but each environment has its **own secret**.
3. **Real money & real PAD mandates.** Once switched, every "Transfer" click on `/transfers/canada` initiates a real Pre-Authorized Debit on the linked Canadian bank account through Stripe. The sandbox helper banner ("use `user_good`/`pass_good`") will be misleading and must be removed.
4. **Stripe must also be in live mode.** The PAD debit is executed by `intra-ca-transfer-create` via Stripe. If `STRIPE_SECRET_KEY` is still a `sk_test_...` key, the debit will fail or be a test charge. To go truly live end-to-end, Stripe needs to be live too.

## What will change

### 1. Environment variables (no UI for you to click — I'll prompt you)
- Update `PLAID_ENV` from `sandbox` → `production`
- Update `PLAID_SECRET` to the **Production secret** from the Plaid dashboard
- Confirm `PLAID_CLIENT_ID` is correct (usually unchanged, but worth re-pasting)

### 2. Frontend copy on `/transfers/canada` (`src/pages/CanadaTransferPage.tsx`)
- Remove the yellow "Sandbox mode — use user_good / pass_good" alert
- Replace it with a Production notice that emphasizes: real bank link, real PAD authorization, funds debited from your actual account
- Remove the "sandbox limitation" wording on the EFT-numbers warning since Production returns real institution/branch/account numbers

### 3. Edge function `supabase/functions/plaid-create-link-token/index.ts`
- No code change required — it already reads `PLAID_ENV` dynamically and builds `https://${PLAID_ENV}.plaid.com`
- It will automatically hit `https://production.plaid.com` once the secret flips

### 4. Edge function `supabase/functions/plaid-exchange-token/index.ts`
- I'll re-read it during build to confirm it also uses `PLAID_ENV` dynamically (same pattern). If it has `sandbox` hardcoded anywhere, I'll fix it.

## Steps once you approve

1. I'll prompt you to update the three secrets (`PLAID_ENV`, `PLAID_SECRET`, optionally `PLAID_CLIENT_ID`) via a secure form.
2. I'll update the page copy on `/transfers/canada`.
3. I'll verify `plaid-exchange-token` is environment-agnostic.
4. I'll re-test `plaid-create-link-token` with curl. If Plaid still returns `INVALID_API_KEYS`, that confirms your Production access hasn't been granted yet by Plaid — and the only fix is requesting it from them.

## Confirm before I proceed
- Has Plaid **already approved** Production access for your company?
- Is your **Stripe key live** (`sk_live_...`), or do you want to keep Stripe in test while Plaid is live (works but the debit side will be simulated)?