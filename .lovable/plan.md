# Phase 3 — Live Routing, Overrides & Failover

Phase 2 left the engine observing only: it ranks partners and logs what it *would* do, but `execute-transfer` still picks rails from hardcoded country/currency rules. Phase 3 lets the engine actually choose the rail, with operator control and automatic failover.

## Current state (verified)

- `payment_partners`, `partner_corridors` and `routing_decisions` are all **empty** — the engine currently has nothing to rank, so shadow logging produces no candidates.
- `payment_partners` already has `payin_function_slug` / `payout_function_slug` / `quote_function_slug` columns, so a partner row can point at the edge function that executes it.
- One active routing rule exists ("Best Overall"), and `routing_rules` has no live/shadow switch yet.

## 1. Seed the partner catalogue

Populate `payment_partners` and `partner_corridors` from the rails already deployed, each mapped to its executing edge function:

| Partner | Function slug | Corridors |
|---|---|---|
| Flutterwave | `flutterwave-payout` | NGN, GHS, KES, UGX, TZS, ZMW |
| PawaPay | `pawapay-payout` | 12 African mobile-money corridors incl. BWP |
| Nomba | `nomba-payout` | NGN bank/transfer |
| Ghana Pay | `ghana-payout` | GHS |
| MTN MoMo | `mtn-momo-payout` | GH, UG, ZM |
| Paysafe | `paysafe-payout` | CAD Interac / EFT |
| Stripe | `stripe-payout`, `stripe-connect-instant-payout` | CAD card push, instant |
| Circle CPN | `initiate-cpn-payout` | USDC-settled bank payouts |
| Stellar SEP-31 | `stellar-sep31-payout` | NG, KE, ZM |
| Yellowcard, Swychr, Paytota, Fincra | respective slugs | as configured |

Seeded with real pricing where known, and left with zero-cost pricing rows where a partner's commercials still need entering (visible as "pricing missing" in the admin UI rather than silently scoring as free).

## 2. Live routing switch + operator overrides

New controls, all corridor-scoped so live routing can be rolled out one corridor at a time:

- `routing_rules.execution_mode` — `shadow` (default, current behaviour) or `live`.
- New `routing_overrides` table: pin a corridor to a specific partner, or block a partner on a corridor, with reason, operator, and optional expiry. Overrides beat the score.
- Global kill switch that instantly returns all routing to the existing hardcoded logic.

## 3. Failover execution

New `routing-execute` shared module used by `execute-transfer`:

1. Resolve ranked candidates (honouring overrides).
2. Attempt candidate #1 by invoking its `payout_function_slug`.
3. On a retryable failure (provider error, timeout, insufficient partner liquidity) fall through to the next candidate, up to `max_retries`.
4. On non-retryable failures (invalid recipient details, compliance block) stop immediately — no failover.
5. If the engine yields no candidates, or the corridor is not live, fall back to today's hardcoded smart-route path unchanged.

Every attempt is written to a new `routing_attempts` table (partner, slug, outcome, provider error, latency, attempt number) and the winning partner is stamped onto `routing_decisions.actual_partner_id`, which makes the Phase 2 performance and profitability jobs reflect reality.

## 4. Admin UI (Settings → Routing Intelligence)

- **Live Control** tab: shadow/live toggle, per-corridor live enablement, kill switch, and an override manager (pin / block partner, with reason and expiry).
- **Attempts** tab: recent executions showing each attempt in order, which partner won, failover chains and error messages.
- Shadow Log gains an "engine agreed with actual rail?" column so the match rate is visible before going live.

## Technical notes

- Ledger postings, fee calculation and transfer status handling are untouched — Phase 3 only changes *which provider function is called*.
- Failover is bounded by `routing_rules.max_retries` and never retries after funds have left the partner; the dispatcher treats an ambiguous provider response as non-retryable and marks the transfer for manual review.
- Idempotency keys are derived per attempt (`transfer_id:partner_code:attempt_n`) so a retried attempt cannot double-pay.
- New tables get RLS restricted to admin/finance via the existing `is_pricing_manager()` function, plus GRANTs for the app and backend services.

## Default rollout

Ships with `execution_mode = shadow` and no corridors live, so nothing changes in production until an operator flips a corridor to live.
