# Kenya (KES) payouts — Nomba only

## Current state (verified)

- The admin corridor rule for payout KE/KES already lists `nomba` as preferred, with `fincra, flovide, flutterwave, paytota` as failover.
- Code defaults (`DEFAULT_PAYOUT_PARTNER`, `defaultPayoutRails`) already put Nomba first for KES.
- `execute-transfer` still walks the failover chain, so a Nomba failure currently hands the payout to Fincra.

## Change

1. Update the KE/KES payout rule so Nomba is the only rail: clear the failover list, keep the rule enabled.
2. Treat Kenya MoMo/bank payouts as a Nomba-exclusive corridor in `execute-transfer`, mirroring how Zambia is pinned to Fincra today:
   - skip the Fincra, Flovide, Flutterwave, Paytota and Swychr rails for KES,
   - skip the scoring routing engine for KES so it cannot pick another partner,
   - on Nomba failure, fail the transfer cleanly (wallet stays funded / reversed as today) with a clear partner error instead of silently retrying elsewhere.
3. Leave Kenya pay-in (collection) untouched — this change is payout only.

## Notes

- Ops `force_rail` overrides remain available if you ever need to push a single Kenya payout through Fincra manually.
- Kenya pricing/rate-card rows for other partners stay in place; they simply stop being selected for payout.
