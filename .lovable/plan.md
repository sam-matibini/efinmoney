## What's actually happening

The ledger is already correct. When a link is claimed, the edge function posts a **second** journal `DR 2199 / CR 1108 (Payment Link release [CODE] via <method>)` and updates `payment_link_payouts.status = 'claimed'`. Both your test links (`TPWJGF7`, `BJBNADV`) already show `status='claimed'`.

The confusion is on the **Transaction Details** screen: it only shows the original escrow journal (DR 2101 / CR 2199), with no indication the escrow has been released. So a paid link still looks "pending" from that view.

No schema or status changes needed — the data is right. We just need to surface it.

## Changes

### 1. `src/pages/TransactionDetailPage.tsx` — payment-link status banner
When the journal's first entry description matches `Payment Link escrow [CODE]`:
- Parse `CODE` from the description.
- Fetch the matching `payment_link_payouts` row (`status`, `claimed_at`, `claimed_method`, `recipient_name`, `short_code`).
- Render a status banner above the debit/credit table:
  - **Pending** → amber "Awaiting claim · expires in X" + Copy link / View link buttons (link to `/payment-links`).
  - **Claimed** → green "Paid · claimed via Interac/EFT/Card · {timeago}" with a "View release entry" link that fetches the release journal (`ledger_entries` where `description ilike 'Payment Link release [CODE]%'`) and routes to `/transactions/<release_journal_id>`.
  - **Expired / Revoked** → muted badge "Funds returned to wallet".
- On the **release** journal (description `Payment Link release [CODE]`) show a "Paid out · originally escrowed on {date}" banner with a link back to the escrow journal.

### 2. `src/pages/PaymentLinksPage.tsx` — minor polish
- Rename the "Claimed" label/tab to **"Paid"** (status value stays `claimed` in DB).
- For paid rows, add a "View transaction" link that opens the release journal in `/transactions/<id>`.
- Auto-expire stale `pending` rows on load (best-effort UPDATE) so old pending links flip to `expired` in the list.

### 3. `src/components/dashboard/RecentTransactions.tsx` (small)
For entries whose description starts with `Payment Link escrow [...]`, append a small badge: green "Paid" if the corresponding link is claimed, amber "Pending" otherwise. (One bulk lookup by short codes, no per-row queries.)

### 4. Memory update
Append to `mem://features/payment-link-payouts`: "Escrow journal stays as DR 2101/CR 2199; claim posts a separate release journal DR 2199/CR 1108. TransactionDetailPage shows a Paid/Pending banner sourced from `payment_link_payouts.status` keyed by the `[CODE]` in the description."

No DB migration. No edge-function changes. Pure UI surfacing of existing data.
