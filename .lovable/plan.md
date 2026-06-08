### Fix the "Edge Function returned a non-2xx status code" on Save Card

**Root cause:** The `stripe-save-card` edge function works correctly. The failures in the logs (401) happened while the user was not yet authenticated. The UI shows a generic error because `supabase.functions.invoke` swallows the JSON error body on non-2xx responses, so the actual reason ("Unauthorized") never reaches the toast.

### Changes

**1. `src/components/cards/SaveCardForm.tsx`**
- Before calling `stripe-save-card`, check `supabase.auth.getSession()`. If there is no session, show a clear toast: "Your session has expired. Please sign in again." and stop.
- When `invoke` returns an error, attempt to extract the readable message from `error.context.response` (the underlying `Response`) by `await response.json()` and surface `error` / `details.error.message` instead of the generic FunctionsHttpError text. Fall back to `error.message` if parsing fails.
- Apply the same readable-error extraction to the `stripe-save-card-confirm` call.

**2. `supabase/functions/stripe-save-card/index.ts`** (minor)
- On the 401 branches, include a `hint: "Sign in and try again"` field in the JSON so the client toast is actionable.

### Out of scope
- No DB migration, no Stripe config changes, no other functions touched. The function itself already works; we are only making the failure mode legible and preventing a guaranteed-fail call when there is no session.
