# Live partner pricing — what it takes

Today all 174 rows in the partner rate card are static: imported from your PDFs, `source = 'file'`, refreshed only when you upload again. Live pricing means the system asks each partner "what does this cost right now?" and writes the answer back automatically.

Two different things can go live, and they are not equally feasible:

| What | Can it be pulled live? | Reality |
|---|---|---|
| FX rates / spreads | Yes, for most partners | Every payout partner quotes a rate per transaction — this is the big win |
| Fee schedules (fixed + %) | Rarely | Fees live in contracts and portals, not APIs. Nomba/Fincra/Swychr publish no fee endpoint |

So the honest target: **live FX and live effective cost per quote; fees stay contract-driven but auto-verified against what we're actually billed.**

## Current state (verified)

- `payment_partners` already has a `quote_function_slug` column designed for exactly this — it is empty on all 13 partners.
- The same pattern already works for balances: `partner-liquidity-refresh` polls `balance_function_slug` per partner and writes `partner_liquidity` with `source = 'api'`.
- `partner_fx_rates` already stores `partner_rate`, `mid_market_rate`, `fx_spread_bps`, `rate_timestamp`, `expires_at`, `source`.
- `partner_pricing.source` supports `api` / `file` / `manual` / `partner_portal`, so live and manual rows can coexist and be told apart.
- Rate refresh plumbing exists (`refresh-fx-rates`, `market-rates`, `nomba-exchange-rate`, `fx-engine`) but is not wired per partner.

Nothing new needs inventing — the slots are there and unused.

## Phase 1 — Live FX per partner (highest value)

- Build one small quote adapter per partner that already exposes rates: Wise, Flutterwave, Nomba, Fincra, Swychr, Circle, Stripe/Square (card FX).
- Register each adapter in `quote_function_slug`, mirroring the balance pattern.
- A scheduled `partner-rates-refresh` job polls every active corridor, computes spread against mid-market, and upserts `partner_fx_rates` with `source = 'api'`.
- Staleness handling: each row gets `expires_at`; expired live rates fall back to the last manual figure instead of silently quoting stale.

## Phase 2 — Real cost capture (fees, without a fee API)

- On every completed transfer, record what the partner *actually* charged (from webhook/settlement payloads) as an observed cost row.
- Compare observed cost against the contracted rate-card row; flag drift beyond a tolerance.
- Result: fees stay contract-based, but you get alerted when a partner quietly charges something else — this is what a fee API would have given you anyway.

## Phase 3 — Live quote in routing

- Routing currently scores on static fees. Switch the cost input to: live FX + contracted fee + observed drift.
- Cache quotes briefly (30–60s) so routing does not hammer partner APIs.
- Keep a hard fallback to the static card if a partner API is down, so payouts never block on pricing.

## Phase 4 — Admin visibility

- Rate-card rows show a source badge (Live / File / Manual) with a last-refreshed timestamp.
- Manual refresh button per partner.
- Coverage/drift panel: which corridors have live pricing, which are still file-only, where observed cost diverges from contract.

## Phase 5 — Governance

- Live rates never overwrite a manually-locked row without review.
- Every refresh logged, so a pricing change is always attributable.
- Alert when a partner's live spread jumps beyond a set threshold.

## Prerequisites from you

- API credentials with **read/quote scope** for each partner you want live (some are separate from payment credentials).
- Confirmation of which partners you have portal/API access to for rates — that determines Phase 1 order.
- A tolerance figure for fee drift alerts (e.g. flag when actual cost exceeds contract by more than 10%).

## Recommendation

Do Phases 1 and 2 first, on Wise + Flutterwave + Nomba only. Those three cover most volume, all have usable rate endpoints, and they prove the pattern before spending effort on partners with weaker APIs. Phases 3–5 follow once live data has accumulated enough to trust in routing.
