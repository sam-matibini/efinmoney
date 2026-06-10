## FX Spot Calculator on Landing Page

A new conversion widget under the hero that lets any visitor pick "You send" and "They receive" currencies, type an amount, and see a live spot rate + estimated payout. The same widget doubles as a shortcut into the authenticated transfer/exchange flow.

### 1. New component: `src/components/landing/FxCalculator.tsx`

Visual: a single dark card (matches landing aesthetic) with two stacked currency rows, a swap button between them, a rate strip, and a primary CTA.

```text
┌──────────────────────────────────────────────┐
│ Live FX calculator           ● Live · 30s    │
│ ┌──────────────────────────────────────────┐ │
│ │ You send         [1,000.00]   [🇨🇦 CAD▾] │ │
│ └──────────────────────────────────────────┘ │
│                  ⇅  (swap)                   │
│ ┌──────────────────────────────────────────┐ │
│ │ Recipient gets   [720,500.00] [🇳🇬 NGN▾] │ │
│ └──────────────────────────────────────────┘ │
│ 1 CAD = 720.50 NGN · fee 0.5% · updated 12s  │
│ [ Sign up & send ]   [ Sign in ]             │
└──────────────────────────────────────────────┘
```

Behavior:
- Source list = our supported "send" currencies (CAD, USD, GBP, EUR).
- Destination list = our payout corridors (NGN, KES, GHS, ZMW, UGX, TZS, RWF, ZAR, XOF, XAF, plus USD/CAD for wallet-to-wallet).
- Pulls rates from the existing public `market-rates` edge function (already used by `MarketTicker`, no auth, returns 60s cached data). Computes cross-rates via USD when a direct pair isn't returned (e.g. `CAD→NGN = (USD→NGN) / (USD→CAD)`).
- Debounced amount input (250 ms) recalculates `receive = amount × rate × (1 − 0.005 fee)`. Fee mirrors the 0.5% used by `fx-engine`.
- Rate strip shows mid rate, fee %, and "updated Xs ago".
- Swap button flips currencies and recalculates.
- Default geo-aware pair: CAD → NGN (matches the existing CAD→NGN row in `market-rates`).

### 2. CTA wiring (sign in / sign up shortcut)

Two buttons under the calculator:

- **Primary — "Sign up & send"**:
  - If `useAuth()` user is null → `navigate("/auth?mode=signup&redirect=" + encodeURIComponent(targetUrl))`.
  - If logged in → go straight to `targetUrl`.
- **Secondary — "Sign in"** (only when logged out): `navigate("/auth?mode=signin&redirect=…")`.

`targetUrl` is decided by the currency pair:
- Same-account swap (both are wallet currencies the user holds, e.g. CAD↔USD) → `/exchange?from=CAD&to=USD&amount=1000` (ExchangePage reads the params, calls `fx-engine` `quote` for the real tradable rate, and pre-fills).
- Cross-border payout (destination is an African corridor) → `/send?from=CAD&to=NGN&amount=1000` (SendPage / CanadaSendFlow reads the params and jumps to the amount step with the live tradable quote from `fx-engine`).

Routing rule lives in a small helper inside `FxCalculator.tsx`:
```ts
const PAYOUT_CCYS = new Set(["NGN","KES","GHS","ZMW","UGX","TZS","RWF","ZAR","XOF","XAF"]);
const target = PAYOUT_CCYS.has(to) ? "/send" : "/exchange";
```

### 3. Light edits to existing pages to honor the deep-link params

- `src/pages/ExchangePage.tsx` — on mount, read `from`, `to`, `amount` from `useSearchParams()` and seed the existing exchange form / call `fx-engine` quote.
- `src/pages/SendPage.tsx` (and/or `src/components/send/CanadaSendFlow.tsx`) — same: read params and start the wizard at the amount/quote step with values prefilled.
- `src/pages/Auth.tsx` — already supports redirect via `?redirect=`; verify it (one-line check). If missing, add: after successful sign-in/sign-up, `navigate(params.get("redirect") ?? "/")`.

### 4. Landing page integration

`src/pages/Landing.tsx` — import `FxCalculator` and render it in the hero section (right under the headline / next to the phone mockups) so it's the first interactive element above the fold. No other landing changes.

### 5. Tradable vs indicative rate disclosure

The landing widget uses the public market mid (no auth). The card footer reads:
> "Indicative mid-market rate. Final tradable rate is locked at quote (60 s) after sign in."

Once the user lands in `/send` or `/exchange`, the page calls `fx-engine` `quote` which returns the real `effective_rate`, markup, fee, and a 60 s rate lock — that's the tradable number.

### Files touched

- **new** `src/components/landing/FxCalculator.tsx`
- **edit** `src/pages/Landing.tsx` (mount the calculator in hero)
- **edit** `src/pages/ExchangePage.tsx` (read URL params → seed form)
- **edit** `src/pages/SendPage.tsx` (read URL params → seed wizard)
- **edit** `src/pages/Auth.tsx` (confirm/add `?redirect=` support)

### Out of scope

- No DB or edge-function changes — `market-rates` and `fx-engine` already cover both the public quote and the authenticated tradable quote.
- No new currencies; uses the corridors already wired into `market-rates` and `fx_rates`.
