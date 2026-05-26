# Grey-inspired Redesign — eFinMoney

Adapt the Grey reference screens into our app while keeping every existing feature. Light, airy, white-card aesthetic with emerald green (current `--primary` hsl 160 84% 39%) replacing every blue accent. Mobile-first, fully responsive up to desktop.

## Visual language (locked across all screens)

- **Background**: soft off-white `hsl(220 20% 97%)`; cards pure white with `rounded-2xl` and subtle shadow.
- **Typography**: keep Space Grotesk display + Inter body. Page titles become large bold (text-3xl/4xl, tracking-tight) like "Cards", "Transactions", "More".
- **Accent green**: every blue pill, icon, active tab, link, and CTA in the reference becomes emerald. The "Earn $5" gradient pill → emerald→teal gradient.
- **Icon style**: thin-stroke lucide icons inside circular green-tinted backgrounds (`bg-primary/10 text-primary`).
- **Action buttons (Add money / Send / Convert)**: white circle, 1px border, icon centered, label below — exactly as reference.
- **Bottom tab bar (mobile)**: 4 tabs, active = filled emerald rounded icon + emerald label; inactive = outline icon + muted label.
- **List rows**: circular avatar/icon left, 2-line label, right-aligned amount (green for credits, foreground for debits).
- **Cards on Cards page**: dark navy→emerald wave gradient (instead of navy→blue) with Visa logo, last-4 digits.

## Theme tokens (index.css)

Switch default to **light** (current is light already). Update `--background` to `220 20% 97%`, `--card` to `0 0% 100%`, soften `--border` to `220 15% 92%`, keep `--primary 160 84% 39%`. Add `--gradient-cta: linear-gradient(135deg, hsl(160 84% 45%), hsl(170 75% 40%))` and `--gradient-card-dark: linear-gradient(135deg, hsl(222 47% 11%), hsl(160 60% 25%))` for the Visa card. Dark mode preserved (toggle stays).

## Screen-by-screen mapping (customer app)

| Reference screen | Our route / file | Changes |
|---|---|---|
| Home | `/dashboard` → `HeroBalance`, `QuickActions`, `WalletCarousel`, `RecentTransactions`, `OtherProducts` (new strip) | New top header (avatar + chat + Earn pill). Total Balance pill with flag stack. Big balance with eye-toggle. 3 circular quick actions. Horizontal wallet cards. Recent tx list. "Other products" chip row (Bills, Gift Cards, Invoices, Airtime). |
| Cards list/detail | `/cards` `CardsPage`, `EfinCardDetailPage` | Top "Cards" + "Add new card". Dark wave card preview (emerald gradient). 3 circle actions (Details / Freeze / Show PIN). Add-to-Google-Wallet row. Grouped list: Card label, Payment limits, Card statement, Expense insights, Card benefits, Where can I use, Need help, Delete (red). All existing features wired. |
| Transactions | `/transactions` (currently `WalletStatementPage` / `TransfersListPage`) | "Transactions" title, search + filter icon, grouped list, infinite scroll preserved. |
| More | new `/more` page (mobile) consolidating settings | Rewards row (Stamps / Points / Badges). Notifications banner. Account group (Profile, Verification w/ Verified pill, Notifications). Finances (Transaction Limits → tier limits). Security (Password, 2FA, Devices & Sessions, PIN). Others (Language, Affiliates, Support, See our rates). Logout red. Version label. |
| Profile | `/profile` `ProfileSettingsPage` | Bold name + email header, avatar circle. "Personal details" white card (First / Middle / Last / Phone / DOB). "@efin_tag" promo card (Create tag CTA). |
| Send / Exchange / Receive / Top-up / Pay bills | existing pages | Re-skin headers, inputs, summary cards to new card style. No logic changes. |

## Admin portal

Same tokens cascade automatically (it uses semantic classes). Targeted polish:
- `AdminLayout` topbar: white, emerald active nav, larger title.
- Tables in `UsersPanel`, `KycQueuePage`, `AuditLogsPanel`, etc.: white card wrapper, rounded rows, emerald badges/buttons.
- KPI tiles, charts, status pills retinted to emerald variants.
- All features (KYC approve/reject, maker-checker, staff mgmt, compliance) untouched.

## Responsiveness

- Mobile (default): single column, bottom tab bar, full-width cards.
- ≥`md`: two-column dashboard (balance + wallets left, transactions right), tab bar hidden, existing sidebar/Header used.
- ≥`lg` admin: keeps current sidebar layout, content grids expand to 12-col.

## Component work

New / refactored presentational components (no business logic):
- `components/layout/MobileTabBar.tsx` — 4-tab bottom nav (Home, Cards, History, More)
- `components/layout/TopBar.tsx` — avatar + chat + Earn pill
- `components/dashboard/TotalBalancePill.tsx`
- `components/dashboard/CircleAction.tsx` (replaces blue square QuickAction visuals)
- `components/dashboard/OtherProductsStrip.tsx`
- `components/cards/CardHeroVisual.tsx` (dark wave emerald gradient)
- `components/cards/CardActionCircle.tsx`
- `components/ui/ListGroupCard.tsx` + `ListRow.tsx` (used by More, Cards detail, Profile)
- `components/more/RewardsRow.tsx`, `components/more/NotificationsBanner.tsx`
- `pages/MorePage.tsx`

Existing pages re-skinned to use the new primitives; all hooks/queries/mutations kept verbatim.

## Color audit

Sweep for hardcoded blue: `text-blue-*`, `bg-blue-*`, `border-blue-*`, `from-blue-*`, `to-blue-*`, `#3b82f6`, `#2563eb`, etc. → replace with `text-primary` / `bg-primary` / gradient utility. Tailwind classes only, no inline hexes.

## Feature preservation checklist

Wallets, Send (Canada + Africa + P2P), Exchange, Crypto, Cards (virtual/physical), Saved cards, Deposits/Top-up, Pay bills, Statements, PDF receipts, KYC (Persona + Interac), Beneficiaries, Notifications, Notifications panel, Search, Admin CRM, Maker-checker, Compliance, Finance dashboards, Settings — all routes and handlers untouched.

## Out of scope

- No DB migrations.
- No new edge functions.
- No copy changes besides re-labelling tabs ("Home/Cards/History/More").
- Logo, brand name stay eFinMoney.

## Rollout

1. Tokens + global primitives (TopBar, MobileTabBar, ListGroupCard).
2. Dashboard + Cards + Transactions + More + Profile re-skin.
3. Sweep remaining customer pages.
4. Admin polish pass.
5. Mobile + desktop visual QA at 375 / 768 / 1280.
