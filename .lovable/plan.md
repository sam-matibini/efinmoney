## Root cause

The Trial Balance groups entries by `currency_code`, but several edge functions post a single journal with legs in **two different currencies** (e.g. card-funded transfer = Dr Card-CAD + Cr Payable-NGN). Each currency side is therefore single-sided and the per-currency TB drifts permanently.

Confirmed unbalanced currencies right now:

```text
CAD   diff   +165.74
NGN   diff -144,592.62
USD   diff   -880.28
ZMW   diff -1,998.10
XLM   diff       -6.00
```

All imbalances trace to the same pattern (cross-currency transfers, reversals, crypto swaps, payout refunds). Hard-coded fee amounts (`2.30`, `3.30`, `5.30`, `115.30`) also appear in `execute-transfer`, `cancel-transfer`, and `internal-transfer` instead of being read from `pricing_config`.

## Plan

### 1. Chart of Accounts — add FX Clearing per currency
Add a contra-asset `13xx FX Clearing - <CCY>` for every active currency (CAD, USD, NGN, KES, UGX, ZMW, XLM, USDC, GHS, ZAR, BWP, etc.). These act as the "other side" of each currency leg in a cross-currency journal. The net of all clearing accounts (translated to base CAD at the journal's FX rate) flows to existing `4100 FX Gain` / `5100 FX Loss` for rounding.

### 2. Shared helper `postMultiCurrencyJournal()`
New file `supabase/functions/_shared/ledger.ts` exposing one function used by every payment/transfer edge function:

```text
postMultiCurrencyJournal({
  legs: [{ account, currency, debit/credit, wallet_id, description }...],
  fx_rate, source_ccy, target_ccy
})
```

It auto-inserts the balancing FX-Clearing legs so **every (journal_id, currency_code) sums to zero**, and routes any rounding to FX Gain/Loss in base CAD.

### 3. Database guardrail (prevents future drift)
Add a deferred constraint trigger on `ledger_entries`:

```text
AFTER INSERT/UPDATE/DELETE → at COMMIT
  for each journal_id touched:
    assert sum(debit)=sum(credit) per currency_code
    raise exception otherwise
```

This makes it physically impossible to commit an unbalanced JE going forward — the source of the bug becomes a hard error, not a silent TB drift.

### 4. Refactor edge functions that post cross-currency JEs
Switch the following to use the new helper (and remove any literal fee amounts in favour of `pricing_config`):

- `execute-transfer`, `cancel-transfer`
- `internal-transfer`, `intra-ca-transfer-create`
- `execute-crypto-swap`
- `stripe-payout` + `paysafe-payout` refund paths
- `flutterwave-payout`, `pawapay-payout`, `mtn-momo-payout`, `yellowcard-payout`
- `payment-link-create` / `payment-link-claim`
- `vendor-bill-pay`, `ca-bill-payment`

### 5. Historical clean-up migration
One-shot correcting journal per legacy unbalanced `journal_id`: insert the missing FX-Clearing leg using the FX rate stored on the originating transfer (fallback to current `fx_rates` snapshot). Any residual rounding posts to `4100`/`5100`. After this migration the TB will balance per currency back to day one.

### 6. Hard-coded amount audit
Grep for literal money values (`= 2.30`, `= 5.00`, `* 0.01`) in edge functions and replace with `pricing_config` reads. Add a unit test in `src/hooks/__tests__/` that fails if any edge function imports `pricing_config` is missing.

### Technical detail

- The constraint trigger uses `DEFERRABLE INITIALLY DEFERRED` so multi-statement inserts within a single transaction still work.
- FX rate captured per journal in `ledger_entries.fx_rate_used` (new nullable column) so historical re-translation is deterministic.
- The TB UI already supports per-currency filter — no UI change needed; after the fixes, each currency will show "Balanced".

### Out of scope
- Re-pricing past transactions (we only add the missing legs).
- Changing the COA numbering scheme.
- UI changes beyond the existing TB panel.
