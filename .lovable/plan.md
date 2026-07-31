## What I verified

- The settings table, its grants, primary key on `key`, RLS policies (read for any signed-in user; insert/update for `admin` role or super admins) and the `updated_at` trigger are all correct in the backend.
- Network capture from your session shows the **Notification** save actually succeeded (HTTP 201 at 09:24 and 200 at 09:27) and the rows are in the database — yet a red "Could not save settings / Unexpected error" toast was shown.
- No `security.*`, `email.*` or `data.*` rows exist yet, so at least one other section has never saved successfully.
- Root cause of the useless message: the settings hook does `throw error`, where `error` is a Supabase error **object**, not an `Error` instance. Every save handler does `e instanceof Error ? e.message : "Unexpected error"`, so the real reason (code, message, hint) is always swallowed and shown as "Unexpected error". The exact failure for the non-saving sections is therefore still unconfirmed.

## Plan

1. **Surface the real error** — in `src/hooks/useSystemSettings.tsx`, convert Supabase errors into a proper `Error` carrying `message`, `code`, `details` and `hint` before throwing, so all settings toasts show the actual cause instead of "Unexpected error". Also log it to the console.
2. **Reproduce each section** — drive the Settings page in a headless browser as the signed-in admin, click every Save button (General, Email, Notifications, Security, Data, Pricing, Module Access) and capture the request/response for each. This tells us definitively which sections fail and why.
3. **Fix the confirmed cause(s)** — likely candidates given the code: numeric inputs sent as empty strings/NaN, a section saving `undefined` values, or a permission gap for admin-portal roles that aren't `admin` in user roles. Fix only what the reproduction shows (input coercion in the panel, or an RLS/role adjustment if that's the real blocker).
4. **Prevent silent success-with-error** — verify the mutation's success path actually correlates with the toast shown, and clean up the duplicate `useSystemSettings` instances if one section's shared mutation state is producing a false failure toast.
5. **Deployed build** — after the fix verifies locally, re-publish so `efinmoney.lovable.app` picks it up; the published bundle can be older than the settings work.

## Technical notes

- Files touched: `src/hooks/useSystemSettings.tsx` (error normalization), and whichever settings panel the reproduction implicates (`SystemSettingsPanel.tsx`, `PricingSettingsPanel.tsx`, `ModuleAccessPanel.tsx`).
- No schema change is planned unless step 2 shows a genuine permission failure; grants and policies already check out.
