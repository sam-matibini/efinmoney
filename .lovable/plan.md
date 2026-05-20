# Fix "branchcode not provided" on UGX payout

## What's happening

The last UGX → Airtel Money transfer failed with `branchcode not provided`. The error comes back from Flutterwave's `/v3/transfers` API.

Flutterwave V3 transfers to Uganda (UGX) — and a few other corridors like Tanzania (TZS) — **require a `destination_branch_code`** in the payout payload (per their [Uganda payout docs](https://developer.flutterwave.com/v3.0/docs/uganda-2)). Our `flutterwave-payout` edge function never sends it, so every UGX payout (bank or mobile money) is rejected by FLW.

This is also why the previous UGX attempts failed even with valid phone numbers — the request never gets past FLW's validation.

## Fix

Edit `supabase/functions/flutterwave-payout/index.ts`:

1. Add a small lookup table for required branch codes per `currency:account_bank` pair, seeded with the network operator branch codes Flutterwave assigns:
   - `UGX:MTN`, `UGX:ATL` → Uganda MTN / Airtel mobile money branch codes
   - `TZS:AIRTEL`, `TZS:VODACOM`, `TZS:TIGO` → Tanzania operator branch codes
   - (Leave NGN/GHS/KES/ZMW/RWF/XAF/XOF alone — they don't need it)
2. When building the V3 transfer payload (both the bank-rail branch and the mobile-money branch), if the currency requires a branch code, attach `destination_branch_code` to the payload.
3. If a UGX/TZS payout is initiated without a known branch code (e.g. an unmapped network), fail fast with a clear "branch code required" message and refund the wallet, instead of letting FLW return the cryptic error.

## Branch codes to use

Flutterwave's official operator branch codes for mobile money payouts:

```text
UGX:MTN     → UG010101   (MTN Uganda)
UGX:ATL     → UG020202   (Airtel Uganda)
TZS:AIRTEL  → TZ010101   (Airtel Tanzania)
TZS:VODACOM → TZ020202   (Vodacom Tanzania / M-Pesa)
TZS:TIGO    → TZ030303   (Tigo Tanzania)
```

These are the codes Flutterwave returns from `/banks/UG/branches` and `/banks/TZ/branches` for the mobile money "banks". If FLW later changes them, we can swap to a dynamic lookup that calls `flw-get-banks` + branches.

## Out of scope

- No UI changes — the SendPage flow already collects everything we need.
- No DB migrations.
- MZN/Mozambique remains unsupported (Flutterwave still doesn't cover it).

## Files touched

- `supabase/functions/flutterwave-payout/index.ts` — add branch-code map + attach `destination_branch_code` in the payload.
