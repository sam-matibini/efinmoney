# Payment Partners: country coverage

## What's actually happening

Zambia isn't missing from the app — it's missing from this table's data.

- The Country filter in Payment Partners is built from the countries already present in the partner rows. Confirmed rows today: CA, CM, GB, KE, NG, NL, US only.
- That `country` field is the partner's own operating/HQ country, not the countries it can pay out to. Fincra is stored as `NG`, so Zambia never appears even though Zambia payouts run through Fincra.
- Zambia does exist elsewhere: `partner_corridors` has 3 ZM corridors, and Zambia (ZMW, MoMo) is in the app's country list.

So there are two separate fixes: the filter should offer every country (not just ones already typed in), and the table should show the countries a partner actually serves.

## Plan

1. Country picker instead of free text
   - In the Add/Edit Partner dialog, replace the free-text "Operating country" input with a searchable, scrollable country combobox backed by the full ISO country list (includes Zambia 🇿🇲 ZM). Stores the ISO-2 code as today, so nothing downstream changes.
   - Show "Zambia (ZM)" style labels, accept typing either the name or the code.

2. Country filter shows all countries
   - The Country column filter will list the full ISO country set (with counts), not only countries present in rows, so Zambia is selectable even before any partner is tagged with it.
   - Countries with zero rows appear greyed with a `0` count so it's obvious the data, not the UI, is empty.

3. New "Serves" column (coverage)
   - Add a sortable/filterable "Serves" column listing the distinct destination countries from `partner_corridors` for each partner (e.g. Fincra → NG, GH, ZM, KE…). Filtering by Zambia here returns Fincra and any other ZM-capable partner.
   - Included in CSV/Excel export.

4. Import/template alignment
   - Validate the `country` column of the CSV/XLSX import against the ISO list, and accept full country names as well as codes (normalising "Zambia" → "ZM").

## Technical notes

- Files: `src/components/settings/partners/PartnersPanel.tsx` (dialog field, columns, import validation) and `src/components/settings/partners/tableToolkit.tsx` (allow a column to supply an explicit option list for its filter).
- Country source: existing `src/lib/isoCountries.ts` (`ISO_COUNTRIES`, already contains ZM) — no new data file.
- "Serves" data: `partner_corridors.dest_country` grouped by `partner_id`, read via the existing partner-network hooks; no schema change and no migration needed.
