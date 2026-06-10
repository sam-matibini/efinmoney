## FX Calculator upgrade

**1. Bidirectional editable amounts**
- Both "You send" and "Recipient gets" become typeable inputs.
- Track `lastEdited: "send" | "receive"` in state. Recompute the *other* side on every change:
  - send edited → `receive = send × rate × (1 − fee)`
  - receive edited → `send = receive / (rate × (1 − fee))`
- Rate refresh (every 60s) recomputes using `lastEdited` as source of truth so the user's typed value never gets clobbered.

**2. Searchable world-currency picker**
- Replace native `<select>` with a shadcn `Popover` + `Command` (cmdk) combobox — same pattern already used elsewhere in the app.
- Source = full ISO 4217 list (~160 currencies). Add `src/lib/worldCurrencies.ts` exporting `{ code, name, country, cc }[]` (static, no network).
- Each row: flag (flagcdn.com) + code + currency name + country. Search matches code, name, or country (e.g. "naira", "nigeria", "ngn").
- Used for both Send and Recipient fields (same full list on both sides — no artificial cap).
- Rate availability: if a pair has no rate in `market-rates`, fall back via USD pivot (already implemented). If still missing, show "Rate unavailable — try another currency" inline instead of a broken number.

**3. "Real with eFinMoney" comparison strip** (replaces the current flat fee line)
- Below the two inputs, add a compact comparison card:

```text
   You save vs. banks      ≈ C$ 38.20  (2.9%)
   ─────────────────────────────────────────
   eFinMoney   1 EUR = 1,554.19 NGN   fee 0.5%   ✓ Mid-market
   Typical bank 1 EUR = 1,509.40 NGN  fee 3.5%   hidden margin
```

- Bank baseline = `rate × (1 − 0.035)` (configurable constant `BANK_MARGIN = 0.035`). Savings = `eFinReceive − bankReceive`, expressed in the send currency and as a %.
- Small badges: "Mid-market rate", "No hidden fees", "Locked for 60s after sign-in".
- Keeps the existing live-rate dot + "Updated Xs ago" header.

**4. Polish**
- Keep CTAs ("Sign up & send" / "Sign in" / "Continue" when logged in) and existing intent→ `sessionStorage` handoff to `/send` or `/exchange`.
- Format numbers with grouping; cap to 2 decimals for fiat ≥1, 4 for <1.
- Disable CTA + show "Rate unavailable" when no rate can be resolved.

### Files
- **New:** `src/lib/worldCurrencies.ts` — static ISO 4217 list with country + flag code.
- **Edit:** `src/components/landing/FxCalculator.tsx` — bidirectional inputs, searchable combobox, savings strip.
- No edge-function, DB, or routing changes.
