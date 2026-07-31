# Make General Settings savable

Today the General Settings card is display-only: the inputs use `defaultValue` and "Save General Settings" does nothing. This adds real persistence for that card (company name, support email, default currency, default timezone).

## What changes

1. **Storage** — new `system_settings` key/value table (one row per setting key, JSON value, updated_by, timestamps).
   - Anyone signed in can read (the app needs the platform currency/timezone); only admins can insert/update, enforced with the existing `has_role(auth.uid(),'admin')` function.
   - Seeded with the current defaults: `eFinMoney`, `support@efinmoney.com`, `CAD`, `America/Chicago`.

2. **Hook** — `src/hooks/useSystemSettings.tsx`: React Query read of all settings plus a `saveSettings` mutation that upserts the changed keys and invalidates the cache.

3. **Panel** — `SystemSettingsPanel.tsx` General Settings card becomes controlled state seeded from the saved values (falling back to `SYSTEM_DEFAULT_CURRENCY` / `SYSTEM_TIMEZONE`), with a loading skeleton, a disabled/spinner save button while writing, and a success/error toast. Non-admins see the fields disabled.

## Scope note

Only the General Settings card is wired up. The Email, Notification, Security and Data Management cards stay display-only for now — say the word and I'll persist those keys too using the same table.
