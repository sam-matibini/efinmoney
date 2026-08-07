# Admin Users list: country column, filters and sorting

Upgrade `/admin/users` so the table shows each user's country and lets admins slice the list quickly.

## What you'll see

**Country column**
- New column between "User" and "Account #" showing a flag + country name (e.g. 🇨🇦 Canada).
- Resolved in this order: address country → profile country code → dial code inferred from the phone number → "Unknown".
- Verified in the database: 28 of 33 profiles currently have no country stored, only 5 have `address_country` (CA, ZA, NG). The phone fallback recovers most of the rest (e.g. +234 → Nigeria, +260 → Zambia), and the column shows "Unknown" where nothing can be resolved rather than guessing.

**Filter bar** (above the table, next to search)
- Country (only countries present in the data, each with a count)
- Account status (active / pending verification / suspended / closed)
- KYC status
- Tier (tier_0 … tier_3)
- Joined range (last 7 days / 30 days / 90 days / all time)
- Active filters show as removable chips with a "Clear all" action; the result count in the header reflects them.

**Sorting**
- Click any of User, Country, Account status, KYC, Tier, Joined to sort; click again to reverse. Arrow indicator on the active column. Default stays newest-joined first.

**Export**
- "Export CSV" button that downloads exactly the rows currently filtered and sorted, country included.

## Technical notes

- `src/lib/userCountry.ts` (new): `resolveUserCountry(profile)` returning `{ code, name, flag }`, built on the existing `ISO_COUNTRIES` / `COUNTRY_FLAG` helpers plus a dial-code → ISO2 map for the corridors we support.
- `src/pages/admin/UsersPage.tsx`: add `address_country` to the profile select, derive country once per row with `useMemo`, then apply filter → sort → render. Filtering and sorting stay client-side (the query is already capped at 500 rows, so no extra round-trips).
- Filter/sort state is mirrored into the URL query string so a filtered view can be shared or reloaded.
- Table styling, badges, row click-through and the row action menu stay exactly as they are.

## SQL

None required — the plan reads columns that already exist (`address_country`, `country_code`, `phone_number`).

Two optional follow-ups I can run after you approve, if you want stored country rather than derived:
- A one-time data update that fills `profiles.country_code` from `address_country`, and from the phone dial code where address country is blank.
- An index on `profiles (country_code)` — only worth it once the user table grows past a few thousand rows.
