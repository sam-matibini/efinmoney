# Country flag in the "Send money to" picker

The destination country picker in the Send Money header shows the country's currency code (e.g. "KE") instead of a flag, because it renders an emoji flag that Windows browsers can't display. Replace it with the same round flag image used everywhere else in the app.

## What changes

- The header button next to "Send money to" shows a round Kenya (or selected country) flag image before the country name.
- Every row in the country dropdown list shows the same round flag image.
- No other behaviour changes — search, selection and the corridor filter stay as they are.

## Technical notes

- In `src/components/send/SendHeaderCountry.tsx`, replace the two `{c.flag}` / `{active?.flag}` emoji spans with `<CountryFlag country={...} size="sm" />` from `@/components/ui/FlagImage`.
- `CountryFlag` resolves the ISO code via `normalizeCountryCode`, which maps full country names from `COUNTRIES` (e.g. "Kenya" → `ke`); verify each `COUNTRIES.id`/`country` name resolves and add any missing entries to the name→ISO map in `src/lib/flags.ts` so no country falls back to the globe icon.
