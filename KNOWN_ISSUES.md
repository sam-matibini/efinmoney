# Known Issues — eFinMoney

_Last refreshed: 2026-05-26 (fresh codebase audit)_

Earlier phases (1–4) cleared the bulk of mock/hardcoded surfaces. This file now
reflects the **actual** remaining gaps after re-scanning every page,
component, hook, and edge function.

---

## ✅ Resolved since previous audit

The following items from the 2026-04-11 audit are now fully implemented and
no longer require work:

- **Exchange — Crypto buy/sell** — `crypto-trading` edge function is live, with
  validation, rate-limiting and ledger swaps. Errors surface as toasts.
- **Exchange — FX swap** — `fx-engine` is live; `fx_rates` table has 60+ live
  pairs refreshed every 15 minutes via `pg_cron` → `refresh-fx-rates`.
  Hardcoded `1.35` fallback removed; missing-rate path surfaces a toast.
- **Cards persistence** — `public.cards` + `public.saved_payment_methods`
  tables back `useCards()` / `useSavedCards()`. All freeze/edit/delete/issue
  actions write to DB.
- **Wallets — Receive flow** — `ReceiveMoneyModal` shows account number,
  `@efin_tag`, email, and an `efin://pay` QR code. Wired from `WalletCard`
  and `/wallet/receive`.
- **Send — Funding sources** — `useFundingSources('bank' | 'card')`,
  `useSavedCards()`, and Plaid-linked accounts replace the old hardcoded
  TD/RBC/BMO/Visa list. Card surcharge reads `pricing.transfer_card_surcharge`.
- **Dashboard — Recent Transactions** — `useStatement()` drives a live ledger
  view; empty state is a real placeholder, no fake rows.
- **Dashboard — Stats Overview** — Growth %, recipient count, country count,
  and KYC tier/status all derive from real `transfers`, `wallets`, `fx_rates`,
  and `profiles` data. The old `+12.5%` / `8 countries` / `Verified Tier 3`
  constants are gone.
- **Quick Actions** — All 8 tiles (Send, Add Money, Receive, Pay Bills,
  Domestic, Exchange, Mobile, Savings) point at real modals or routes.
- **Header — Search** — `SearchModal` queries `transfers` + `wallets` with a
  debounced ilike search and routes to detail pages.
- **Header — Notifications** — `public.notifications` table populated by DB
  triggers (`notify_transfer_event`, `notify_kyc_status_change`,
  `notify_compliance_alert`); `NotificationsPanel` renders unread badge + list.
- **Profile / KYC / Security pages** — `/profile`, `/kyc`, `/security` exist
  behind `ProtectedRoute` with real forms and Persona/Interac wiring.

---

## 🟠 Remaining gaps (small, scoped)

### 1. `MorePage` — Rewards tiles labelled "Coming soon"
`src/pages/MorePage.tsx` lines ~125–138 render **Points** and **Badges** tiles
with a `Coming soon` badge. The **Stamps** tile shows a hardcoded `0/174`
counter — no `rewards_stamps` table exists.
**Fix**: either build a minimal rewards ledger or hide the tiles until ready.

### 2. `IntegrationsPanel` — Generic fallback toast
`src/components/settings/IntegrationsPanel.tsx:246` falls back to
`toast.info("Configuration page coming soon")` for any integration not in
the explicit switch. Acceptable as defensive default, but each new integration
should add its own configure route.

### 3. Landing page copy
`src/pages/Landing.tsx:230` advertises **"iOS & Android coming soon"** — this
is marketing copy, not a code bug. Leave or remove as product decides.

---

## 🟡 Things worth double-checking (not bugs, but watch)

- **Push notifications / web push** — `notifications` table + `NotificationsPanel`
  cover in-app delivery; there is no service-worker push or device-token
  registration yet. Email fan-out works via `invoke_send_email`.
- **Global search scope** — `SearchModal` only searches `transfers` and
  `wallets`. Contacts, beneficiaries, cards, and ledger lines are not yet
  indexed.
- **Country count semantics** — `StatsOverview` counts distinct
  `recipient_country` values from completed and pending transfers. If a user
  has only intra-CAD transfers, the count will be 1 — by design, but worth
  noting in the tooltip.
- **Rewards stamps counter** — Renders `0/174` as a static string; safe to
  ship as visual placeholder but flag if anyone reads it as functional.

---

## How this file is maintained

Re-run a fresh audit whenever a phase closes. Move resolved items to the
**Resolved** section with a one-line note; only keep genuinely broken or
mocked surfaces in **Remaining gaps**. Avoid copying stale TODOs forward.
