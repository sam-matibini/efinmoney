# Partners & Routing: sortable/filterable tables, pricing editing, Excel export

Make every table in the Partners & Routing area behave like a proper data grid, add full edit/import/export to Customer pricing, and give Network Activation Excel export plus partner/provider sorting.

## 1. Sort and filter on every column

Today the partner panels render plain tables with static headers — no sorting, no filtering. The admin list pages already solved this with a shared helper (`useSortState` / `SortHead` / `FilterChips` / `downloadCsv`), so the fix is to extend that helper and roll it out.

What you'll get on each table:
- Click any column header to sort; click again to reverse. Arrow shows the active column and direction. Numeric columns sort numerically, dates chronologically, text alphabetically.
- A filter row above each table: free-text search across the visible columns, plus dropdowns for the categorical columns of that table (partner, direction, country, currency, status, source, tier, etc. — only the values actually present, with counts).
- Active filters appear as removable chips with "Clear all"; the row count reflects the filtered set.
- Filter/sort state mirrored into the URL so a filtered view is shareable.
- Every table gets "Export CSV" and "Export Excel" of exactly the rows currently filtered and sorted.

Panels covered (all tabs under Partners & Routing): Partners, Corridors, Partner pricing, Partner FX, Customer pricing, Liquidity, Live routing, Attempts, Readiness, Profitability, Cost assurance, Settlements, Guardrails, Recommendations, Fee adjustments, Scorecards, Forecast, Float runway, Incidents, Limits, API partners, Alerts.

## 2. Customer pricing: edit, import, export, download

Currently you can only add a row or retire it — there is no edit, and no import/export.
- **Edit**: pencil on each row opens the same dialog prefilled; saving creates a new current version and retires the old one so pricing history stays intact (the panel's history toggle keeps working).
- **Export**: download the current price book as CSV or Excel (.xlsx), including retired rows when the history toggle is on.
- **Import**: upload a CSV/XLSX with the same column layout. You get a preview table showing new / changed / unchanged / invalid rows before anything is written, then "Apply" writes only the accepted rows. Invalid rows are listed with the reason and never applied.
- **Download template**: a one-click empty template with the correct headers so imports match first time.

## 3. Network Activation: Excel export of the preview

The Preview result is currently on-screen only. Add "Export Excel" (and CSV) next to Preview/Apply that downloads the previewed rows — one sheet each for Pricing, FX, Customer pricing, plus a Skipped sheet with the reasons. Enabled as soon as a preview exists, and it exports the preview exactly as shown (including after sorting).

## 4. Network Activation: sort by partner and by provider

Add sortable headers on the preview tables for Partner and Provider (plus corridor, fee and rate columns), with the same click-to-toggle behaviour, and a partner/provider filter dropdown above the preview so a large preview can be narrowed before applying.

## 5. FX: automatic ascending/descending

On the Partner FX table, clicking a column header sorts immediately with no extra menu or apply step — first click ascending, second descending, third back to the default (most recently recorded first). Applies to Partner, Pair, Partner rate, Mid-market, Spread, Recorded and Source. Default view stays newest-first, and expired rates keep their dimmed styling wherever they land in the sort.

## Technical notes

- Extend `src/components/admin-portal/TableControls.tsx` into a shared partner-table toolkit: keep `useSortState`/`SortHead`/`compareBy`/`FilterChips`/`downloadCsv`, and add
  - `useTableQuery<T>({ rows, columns })` — one hook returning filtered+sorted rows, chips, and the export payload, so each panel adds ~10 lines instead of bespoke logic;
  - `downloadXlsx(filenameBase, sheets)` built on the already-installed `xlsx` package (same approach as `src/lib/statementExport.ts`);
  - `parseSpreadsheet(file)` for imports (CSV + XLSX via `xlsx`).
- Each partner panel declares a small column descriptor array (key, label, accessor, type: text/number/date/enum, exportable) and renders headers from it — no change to existing row markup, badges or dialogs.
- Customer pricing edit reuses `useAddEfinPricing` + `useRetireEfinPricing` in one mutation (retire old, insert new) so no schema change is needed; import uses the existing bulk insert path.
- Filtering and sorting stay client-side — these queries are already capped well under 1000 rows, so no extra round-trips.
- Sequencing: shared toolkit first, then FX + Activation (items 3–5), then Customer pricing (item 2), then the remaining tables (item 1) in batches so each batch can be reviewed.

## SQL

None required — all of this reads and writes columns that already exist.
