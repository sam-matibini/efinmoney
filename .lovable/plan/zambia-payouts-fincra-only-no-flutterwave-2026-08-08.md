# Zambia payouts: Fincra only, no Flutterwave

## Current state

In `execute-transfer`, Zambia mobile money is no longer Fincra-exclusive. `zambiaMomo` is explicitly excluded from `fincraExclusiveCorridor` (line 444-452), so a ZMW transfer enters the shared priority chain and, when Fincra fails, falls through to **Elicate** (step 1b, line 745) and then **Flutterwave** (step 2, line 762). There is also an older `else if (isZambia)` branch (line 850) that sends Zambia straight to `elicate-payout`.

## The change

Make Fincra the only payout rail for Zambia ZMW.

- Put Zambia mobile money back inside `fincraExclusiveCorridor` alongside Kenya and Ghana, so ZMW takes the Fincra-only branch and never enters the multi-rail chain.
- Remove the Elicate failover step for Zambia and the standalone `isZambia` → `elicate-payout` branch.
- Guard the Flutterwave step so ZMW can never be attempted there even if a future corridor change routes it into the chain.
- Keep Zambia skipping the routing engine (already the case) so the hardcoded Fincra path is authoritative.

## Failure behaviour after the change

Because the Fincra-only branch calls `fincra-payout` with `skip_reversal: false`, the wallet is refunded inside that function on failure — no second rail is attempted and no double reversal occurs. Zambia keeps the work already landed on the Fincra side: single canonical `260XXXXXXXXX` number, `NGN → USD → ZMW` funding chain, and Fincra error classification. When Fincra reports maintenance or a transient outage, the transfer fails with the customer-safe message ("Zambia mobile money is temporarily unavailable — your funds have not left your wallet.") instead of silently retrying on another provider.

Each Fincra attempt is still recorded in `routing_attempts` so failures remain reviewable.

## Technical notes

- `supabase/functions/execute-transfer/index.ts` — `fincraExclusiveCorridor` includes Zambia/ZMW MoMo; delete the Zambia Elicate failover block and the `else if (isZambia)` Elicate branch; add a ZMW exclusion to the Flutterwave chain step; ensure the post-chain reversal block still excludes the exclusive path (it already keys off `fincraExclusiveCorridor`).
- Redeploy `execute-transfer`.

No schema, pricing, or frontend changes. `elicate-payout` and `flutterwave-payout` stay in place for the corridors that use them.
