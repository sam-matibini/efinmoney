# Payment Partners: fix typing bug, searchable filters, partner code, template import

## 1. Fix the "type one letter and it stops" bug (root cause found)

`useTableQuery` in `src/components/settings/partners/tableToolkit.tsx` defines `Controls`, `HeadRow` and `SortHead` as new function components on every render. Each keystroke changes state, React sees a brand-new component type, unmounts the old subtree and mounts a fresh one — so the search box loses focus and its caret after every character. That is exactly the "it stops and asks me to type again" behaviour.

Fix: stop returning freshly-created components. Extract `PartnerTableControls` and `PartnerTableHead` as stable module-level components that receive state via props (or memoize them with `useMemo`/`useCallback` so identity is stable). This fixes typing in every panel that uses the toolkit, not just Payment Partners.

Also debounce the search value (~150ms) for the filtering pass while keeping the input fully controlled, so long partner lists stay smooth.

## 2. Searchable, scrollable, typable filter dropdowns

The filter dropdowns (Direction, Country, Settlement, Status) are plain shadcn `Select` lists today — no typing, and they get long. Replace them with a shared `FilterCombobox`: a Popover + Command combobox that

- has a text input at the top that filters options as you type,
- scrolls with a max height (~280px) instead of growing off screen,
- keeps the "All <label>" reset option and the per-value counts,
- shows a checkmark on the selected value and stays keyboard navigable.

Because the toolkit is shared, every Partners & Routing table gets searchable filters at once.

## 3. Partner filter on the Payment Partners table

Add a dedicated Partner filter (name + code) alongside the existing Direction / Country / Settlement / Status filters, using the same searchable combobox — so you can jump straight to Nomba, Flutterwave, Fincra, Wise, etc. without typing in the free-text box.

## 4. Partner code as a first-class column

`code` already exists on the `payment_partners` table and is stored on every row (it renders as the small grey text under the partner name), so no schema change is needed. What's missing is treating it as a real field:

- Add a separate sortable **Code** column so codes can be sorted and read at a glance.
- Include Code in the CSV/Excel export header.
- In the add/edit dialog: mark Code as required, normalise it to lowercase with dashes/underscores only, and block saving a code that already exists (case-insensitive) with an inline "code already in use" message.
- Make Code read-only when editing an existing partner (routing and edge functions look partners up by code, so changing it silently breaks routes) with a hint explaining why.

## 5. Template upload for partners

Add **Download template** and **Import** buttons in the Payment Partners header, mirroring the Customer pricing import already in `EfinPricingPanel`:

- Template is a CSV with the exact headers: code, name, direction, country, regulatory_status, settlement_currency, settlement_time, api_status, integration_status, compliance_risk, reliability_score, priority, min_transaction, max_transaction, daily_limit, monthly_limit, supported_currencies, supported_countries, payment_methods, payin_function_slug, payout_function_slug, quote_function_slug, status, notes.
- Import accepts CSV or XLSX, then shows a preview table classifying each row as **new**, **update** (code already exists), **unchanged**, or **invalid** with the reason (missing code/name, bad direction/status value, non-numeric score, duplicate code inside the file).
- Nothing is written until you press Apply; invalid rows are never applied. New rows are inserted, matching codes are updated by code, and the table refreshes when done.

## Technical notes

- Toolkit changes in `src/components/settings/partners/tableToolkit.tsx`: stable `Controls`/`HeadRow` components, debounced search, new `FilterCombobox` (Popover + Command from the existing shadcn set), and a `Col.filterSearchable` flag defaulting to on.
- Partners panel changes in `PartnersPanel.tsx`: new Code column + Partner filter, code validation in the dialog, and an import dialog reusing `parseSpreadsheet` / `downloadCsv` / `downloadXlsx` from `src/lib/tableExport.ts`.
- Import writes through the existing `useCreatePartner` / `useUpdatePartner` mutations in `src/hooks/usePartnerNetwork.tsx` — no new data path.
- Regression check after the fix: type continuously in the search box of Partners, Corridors, Partner FX and Customer pricing and confirm focus is never lost.

## SQL

None required — `payment_partners.code` already exists and the grants for `authenticated` are in place.
