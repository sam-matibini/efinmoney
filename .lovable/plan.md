## Fix: Cancel Transfer "Failed to send a request to the Edge Function"

**Root cause:** The `cancel-transfer` edge function had been written but never deployed, so the browser got a network-level "Failed to send a request" error from `supabase.functions.invoke()`.

**Fix:** Deploy the `cancel-transfer` function. No code changes are required — the function source already exists at `supabase/functions/cancel-transfer/index.ts` from the previous turn and the frontend wiring (`useCancelTransfer` hook + Cancel button on the tracking page) is correct.

I've already triggered the deploy. Once approved, click the Cancel button again on the transfer page and it will now reach the function, reverse the ledger journal, and refund your wallet immediately.