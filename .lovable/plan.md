# Configure Interac e-Transfer through Wise

## What the error means

The checkout shows "Interac e-Transfer is not configured yet" because the backend cannot resolve a CAD Interac deposit alias (the email address your customers e-Transfer money to).

Confirmed by inspection:
- The only Wise-related secret in this project is `WISE_CAD_INTERAC_ALIAS`. There is **no `WISE_API_TOKEN`** and **no `WISE_PROFILE_ID`**, so the Interac function cannot talk to Wise at all — its Wise alias lookup (`/v1/profiles/{id}/account-details`) is skipped entirely and it falls back to the alias secret.
- The exact wording shown in the screenshot does not exist anywhere in the current source, which means the deployed copy of `fincra-cad-interac` is older than the code in the repo (the repo version says "Interac details are being prepared…"). So the function also needs a redeploy.
- No rejection entries appear in the function logs for the failing attempt, consistent with a stale deployment.

## Fix

1. **Add the missing Wise credentials** as secrets: `WISE_API_TOKEN` (Wise API key) and `WISE_PROFILE_ID` (your Wise business profile ID). Optional: `WISE_ENV` (`production` or `sandbox`).
2. **Confirm the CAD alias**: re-enter `WISE_CAD_INTERAC_ALIAS` with the autodeposit-enabled e-Transfer email that receives CAD into your Wise balance (its current value may be blank or wrong). Once the API token exists, the function prefers the alias Wise reports for the CAD balance and only falls back to this secret.
3. **Redeploy `fincra-cad-interac`** so the current code (with accurate error messages and branch logging) is live.
4. **Add a config self-check**: the bootstrap `GET` already returns `configured`; surface it in `InteracCheckout` so the payer form is only enabled when an alias exists, and show a specific "Interac is unavailable — use card checkout" state otherwise instead of failing after the user fills the form.
5. **Verify end to end**: bootstrap returns `configured: true` with an alias, pressing Pay creates an intent with a reference, and `wise-webhook` matching stays untouched.

## Technical notes

- Alias resolution lives in `resolveInteracAlias()` / `aliasFromWise()` in `supabase/functions/fincra-cad-interac/index.ts`; the `alias_missing` branch returns 503.
- Wise config is read in `supabase/functions/_shared/wise.ts` from `WISE_API_TOKEN`, `WISE_PROFILE_ID`, `WISE_ENV`, `WISE_BASE_URL`.
- Frontend change is limited to `src/components/payments/InteracCheckout.tsx` (read `configured` from bootstrap, gate the form).
- If Wise does not expose an Interac receive option for the CAD balance on your plan, the alias secret path remains the supported configuration and step 4 keeps the UX clean.

I will ask for the Wise secrets through the secure secret form — do not paste keys in chat.
