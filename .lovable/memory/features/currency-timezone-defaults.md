---
name: Currency & Timezone Defaults
description: System default currency CAD, user base currency derived from domicile country, system clock CST with IP/browser timezone detection
type: feature
---
- `src/lib/systemDefaults.ts`: SYSTEM_DEFAULT_CURRENCY = "CAD", SYSTEM_TIMEZONE = "America/Chicago". Never hardcode "USD" as a platform fallback.
- User base currency = domicile country currency (`address_country` → `country_code` via `countryToCurrency`), then `profiles.default_currency`, then CAD. Hook: `useBaseCurrency()`.
- `profiles.default_currency` defaults to CAD; `handle_new_user` creates a CAD default wallet (USD secondary). SQL helper `public.country_to_currency(text)`.
- Timezone: `useUserTimezone()` (browser → `geo-detect` edge fn via IP → country map → CST). Admin/system timestamps use `formatInSystemTz()` (CST/CDT label); customer-facing use `formatInUserTz()`.
