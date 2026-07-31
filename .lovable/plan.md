# Currency & Timezone Localization

## 1. System default currency → CAD

Today there is no persisted system settings record: the General Settings card in Settings → System Settings is a static form (defaults hardcoded to `USD` / `UTC`, Save button does nothing), and the rest of the app falls back to the literal `"USD"` in many places.

Changes:
- Add `src/lib/systemDefaults.ts` exporting `SYSTEM_DEFAULT_CURRENCY = "CAD"`, `SYSTEM_TIMEZONE = "America/Chicago"` (CST/CDT), and helpers.
- Change the General Settings defaults in `SystemSettingsPanel.tsx` to CAD and Central Time, and add CAD to the currency options list.
- Replace the hardcoded `"USD"` platform-level fallbacks with `SYSTEM_DEFAULT_CURRENCY` in the places where the fallback represents "the platform default" (dashboard stats, top-up/cards/send fallbacks, CRM/finance customer currency resolution). Places where `USD` is a genuine business value (USDC, USD corridors, FX pair bases) stay untouched.

## 2. User base currency = domicile country's currency

`countryToCurrency()` already maps ISO-2/ISO-3 → currency and is used ad-hoc in a few components.

Changes:
- Add a `useBaseCurrency()` hook: resolves in order `profile.address_country` → `profile.country_code` → `profile.default_currency` → `SYSTEM_DEFAULT_CURRENCY` (CAD).
- Use it in the main user-facing surfaces that currently do their own fallback: dashboard hero/stats, wallets, send, top-up, cards, statements.
- On signup/onboarding completion, persist the derived currency into `profiles.default_currency` so server-side flows (edge functions reading `default_currency`) agree with the UI. A one-time backfill migration sets `default_currency` from the stored country for existing profiles that have no value or a mismatched one (only when the profile has a country on file).

## 3. System time CST + IP-based user timezone

Changes:
- New public edge function `geo-detect`: reads the caller IP from `x-forwarded-for`, looks up country + IANA timezone via a free IP geolocation lookup, returns `{ country, timezone, currency }`. Fails soft (returns null) so nothing breaks offline.
- New `src/hooks/useUserTimezone.tsx`: prefers the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, falls back to the `geo-detect` result (cached in `localStorage`), then to the country→timezone map already in `src/lib/greeting.ts`.
- Add `formatInUserTz()` / `formatInSystemTz()` helpers in `src/lib/datetime.ts`. User-facing timestamps (transactions, statements, receipts, dashboard greeting) render in the detected user timezone; admin/system surfaces (audit log, admin dashboards, system settings) render in CST with an explicit `CST`/`CDT` label so operational records stay on one clock.
- Extend the country→timezone map in `greeting.ts` with the remaining supported markets (BW, etc.) and default to `America/Chicago` instead of the machine clock.

## Technical notes
- No schema changes beyond the optional `default_currency` backfill migration; no new tables.
- `geo-detect` runs with `verify_jwt = false` in `config.toml` so it works pre-login, and only ever returns coarse geo data.
- Ledger/accounting logic and FX pair bases are unaffected — this is presentation + default-selection only.
