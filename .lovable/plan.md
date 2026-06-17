## Goal

Add a Share / Print / Download toolbar to `TransactionDetailPage` so any transaction report can be sent via Email, SMS, WhatsApp, printed, or saved as PDF — without a backend round-trip.

## Approach

Client-only. Reuse the existing rendered details card; no new edge function.

## Implementation

1. **`src/components/transactions/TransactionShareBar.tsx`** (new). Renders a row of buttons sitting between the header and the status banner on `TransactionDetailPage`:
   - **Share** — Web Share API (`navigator.share`). On mobile this opens the OS sheet (WhatsApp, SMS, Mail, etc.). Falls back to a dropdown when unsupported.
   - **WhatsApp** — `https://wa.me/?text=<encoded summary + link>`
   - **SMS** — `sms:?&body=<encoded summary + link>`
   - **Email** — `mailto:?subject=...&body=...`
   - **Print** — `window.print()`
   - **Save as PDF** — also `window.print()` (browser print dialog → "Save as PDF"). One button, tooltip explains.
   - **Download (.txt)** — Generates a plain-text receipt blob (account/debit/credit lines, totals, journal id, status) and triggers a download — guaranteed offline export.
   - **Copy link** — `navigator.clipboard.writeText(window.location.href)`.

   Helper `buildShareText(entries, journalId, status)` produces a compact, line-broken summary:
   ```
   eFinMoney — Transaction
   Ref: PAYMENT LINK ESCROW [BJBNADV]
   Status: Paid · claimed via INTERAC
   Jun 15, 2026 1:56 AM
   2.00 CAD
   View: https://efin.money/transactions/<id>
   ```

2. **`src/pages/TransactionDetailPage.tsx`** — mount `<TransactionShareBar entries={entries} journalId={journalId} status={plLink?.status} referenceLabel={referenceLabel} firstDate={first?.created_at} />` just below the title row. Pass `paymentLink` info when available to enrich the share text.

3. **Print stylesheet** — add a small `@media print` block to `src/index.css`:
   - Hide `header`, `nav`, `.no-print` (apply this class to the share bar + Back/Copy ref buttons).
   - Force white background on `.bg-card`, drop shadows, set `body { background: white }`.
   - Page-break-inside: avoid on the journal table.

   This keeps "Save as PDF" output clean — only the transaction card prints.

4. **No backend, no schema changes, no new dependencies.** Web Share + `mailto:`/`sms:`/`wa.me` + `window.print` cover everything on both desktop and mobile.

## Out of scope
- Server-rendered PDF (the journal already exports cleanly via the browser's PDF engine).
- Sending Email/SMS through eFinMoney's own infra (uses the user's mail/SMS client, which is what the request implies and what Plaid/Wise do here).
