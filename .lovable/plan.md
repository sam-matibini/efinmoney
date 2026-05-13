## Bug

`supabase/functions/execute-transfer/index.ts` line 206 hardcodes the payout network as `"mpesa"` for every non-bank payout:

```ts
network: transfer.payout_method === "bank" ? "bank" : "mpesa",
```

So even though the `/send` UI correctly stores `payout_method = "mtn_mobile"` for a Zambia (ZMW) transfer, the call to `flutterwave-payout` still arrives with `network: "mpesa"`. `flutterwave-payout` then checks `V3_MM_BANK["ZMW:mpesa"]`, finds nothing, and reverses the ledger with **"Unsupported network mpesa for ZMW"** — exactly the error in the user's tracking timeline.

## Fix

Derive the network from `transfer.payout_method` (and fall back to currency for legacy rows) so that each currency gets a network value that matches a key in `V3_MM_BANK` inside `flutterwave-payout`:

| `payout_method`   | network |
|-------------------|---------|
| `mtn_mobile`      | `mtn`     |
| `airtel_money`    | `airtel`  |
| `zamtel_money`    | `zamtel`  |
| `vodafone_cash`   | `vodafone`|
| `tigo_pesa`       | `tigo`    |
| `mpesa`           | `mpesa`   |
| `mobile_money`    | currency-default (KES→mpesa, ZMW→mtn, GHS→mtn, UGX→mtn, TZS→airtel, RWF→mtn) |
| `bank`            | `bank`    |

Implementation:

1. In `supabase/functions/execute-transfer/index.ts`, replace the hardcoded line with a small `resolveNetwork(payout_method, currency)` helper that returns the correct token using the table above.
2. No DB migration, no UI change, no change to `flutterwave-payout` — its `V3_MM_BANK` lookup already handles `ZMW:mtn`, `ZMW:airtel`, `ZMW:zamtel`.

After this fix, sending ZMW via MTN MoMo (or Airtel / Zamtel) will hit `V3_MM_BANK["ZMW:mtn"] = "MTN"` and proceed to the real Flutterwave payout instead of being reversed.

## Out of scope

- Changing the Quick Send mobile-money modal (it already passes the correct network value directly and is not affected).
- Refactoring `payout_method` storage or renaming columns.
