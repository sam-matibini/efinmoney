# Kenya payout stuck in "Processing" — fix

## What actually happened (verified in the database)

Transfer `2d26aa49` (KES 186 to +254725293898, M-Pesa) is `pending_ops`, rails attempted: `nomba` only.
Nomba returned HTTP 404:

```text
Neither CAD/KES nor KES/CAD is found for trade region NG and trade context default
```

So Nomba accepted the corridor but rejected the **currency pair we asked it to debit**. The send was funded from the CAD wallet, and `nomba-payout` sets the Global Payout `sourceCurrency` to the transfer's source wallet currency (CAD) whenever it differs from the destination. Our Nomba account trades in region NG, which has no CAD/KES pair — so every CAD-funded Kenya send fails this way. The earlier "Nomba only" change is working as intended; the payout request body is the problem.

## Fix

1. In `nomba-payout`, stop passing the customer's wallet currency as the Nomba debit currency. Resolve the debit currency by what Nomba can actually trade:
   - try the destination currency (same-currency debit, e.g. KES/KES) first,
   - then `NGN` (our NG trade region float),
   - keep `NOMBA_PAYOUT_SOURCE_CURRENCY` as an explicit ops override.
2. Validate the chosen pair with the existing `/global-payout/exchange-rates` call before authorizing; if a pair is missing, move to the next candidate instead of sending a request Nomba will 404.
3. Convert the amount consistently with the chosen debit currency (send `target_amount` for a same-currency debit; use the locked `exchangeRateId` amount when debiting NGN).
4. Return a clear, ops-readable error (`code: "pair_unavailable"`, listing the pairs tried) when no candidate works, so the ops queue note is actionable rather than raw Nomba text.
5. Re-drive the stuck transfer `2d26aa49` through Nomba once the fix is deployed; if it still can't be paid, leave it in the ops queue for refund rather than forcing it.

## Notes

- No change to the Kenya rail policy — Nomba stays the exclusive KES payout rail with no failover.
- Same fix also unblocks other cross-wallet Nomba corridors (CAD wallet → GHS/UGX/TZS/RWF), which fail for the identical reason today.
- No database schema changes needed.
