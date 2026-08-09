# Fix the Interac checkout "Edge Function returned a non-2xx status code" error

The red message under the billing address is the generic Supabase client error — the real reason the payment could not start is in the response body, which the checkout currently throws away. So step one is to surface the actual reason, then fix it.

## What is confirmed

- The `fincra-cad-interac` function returns a JSON `{ error: ... }` body for every failure path (missing deposit alias, missing/invalid `transfer_id`, wallet not CAD, wallet or transfer not found, insert failure).
- `InteracCheckout` calls `supabase.functions.invoke(...)` and rethrows `fnError` directly. Supabase's `FunctionsHttpError` never includes the body, which is exactly why the user sees "Edge Function returned a non-2xx status code".
- The function logs show only boot/shutdown lines for the failed attempts — no `console.error` — so the request exited on one of the early validation/config branches (a 4xx or the 503 "details are being prepared"), not on the database insert.
- The intents table has every column the function writes, and its status/purpose constraints already allow the values used, so schema is not the problem.

## Changes

1. **Surface the real error (frontend)** — in `src/components/payments/InteracCheckout.tsx`, follow the existing project pattern (`src/lib/adyen.ts`, `useTreasury`): when the invoke error is a `FunctionsHttpError`, read `error.context.json()` and show `error` from the body. The banner will then say e.g. "transfer_id required for transfer funding" or "Interac details are being prepared" instead of the generic HTTP text.

2. **Make the failure paths diagnosable (backend)** — in `supabase/functions/fincra-cad-interac/index.ts`, add one `console.warn` on each early-return branch (config/validation/lookup) with the branch name and non-sensitive context (purpose, currency, whether an alias resolved). No behaviour change.

3. **Fix the root cause once named** — with the message visible, apply the matching fix:
   - Deposit alias missing → confirm the `WISE_CAD_INTERAC_ALIAS` secret is present and reachable from this function; if not, add it.
   - `transfer_id required for transfer funding` → in `SendPage.tsx`, only open the Interac pane once the draft transfer exists so a real transfer id is passed, and keep the pane disabled until then.
   - Wallet/transfer lookup or currency errors → correct the wallet passed into `walletId` for the CAD funding pane.
   Whichever it is, the fix stays inside the Interac checkout path.

4. **Verify** — re-run the flow in the preview and confirm the intent is created (status `awaiting_payment`, an `EFM-…` reference) and the status view appears.

## Notes

Steps 1 and 2 are worth keeping regardless of the root cause: they are the reason this error was opaque in the first place. No database migration is expected.
