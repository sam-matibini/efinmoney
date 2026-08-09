# Interac e-Transfer: auto-open the checkout form

## Goal
Selecting the Interac e-Transfer tab should immediately show the Interac checkout details (amount, deposit address, reference, instructions) instead of requiring a "Get Interac details" click — and the stale error path that can blank the panel should be removed.

## What's wrong today
In `src/components/payments/CadInteracTopUpCard.tsx` the initial load does two calls: a `supabase.functions.invoke("fincra-cad-interac", { method: "GET" })` (which is not a usable GET) and then a real `fetch`. The state is only applied when the first call returns no error:

```text
if (!error && json) { setAlias(...); setConfigured(...); setIntent(pending) }
```

When that bogus invoke errors, the alias, `configured` flag, and any existing pending intent are all discarded — so the panel stays on the button/"details being prepared" state and clicking is the only path forward.

## Changes

1. `src/components/payments/CadInteracTopUpCard.tsx`
   - Drop the bogus `functions.invoke(..., { method: "GET" })` call; keep only the `fetch` GET and apply its result unconditionally (guarding on `res.ok`).
   - Auto-create the intent on mount when the wallet is CAD, no pending intent was returned, and the amount from the top-up page is valid (>= 1). Reuse the existing `handleCreate` logic so the checkout form renders immediately.
   - Run auto-create once per amount (a ref guard) so re-renders and polling don't spawn duplicate intents.
   - While auto-creating, show a small "Preparing Interac details…" spinner instead of the button.
   - Keep the manual button as the fallback for when no amount is entered yet, or when auto-create failed — in that case show the error inline with a "Try again" action rather than only a toast.

2. No backend or database changes. Alias resolution (Wise receive options, then `WISE_CAD_INTERAC_ALIAS`) and the intents table stay as-is.

## Verification
- Open `/wallet/topup`, CAD wallet, enter an amount, choose Interac e-Transfer: the deposit address, reference, and instructions appear without a click.
- Switch to Bank EFT and back: no duplicate intents are created.
- With no amount entered, the amount field plus button still show, and a failure surfaces an inline retry.
