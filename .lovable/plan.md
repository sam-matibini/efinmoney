## Root cause

Two independent problems produced this batch of errors:

**A. Missing database objects (most of the errors).** A live DB check confirms these objects do **not** exist in the current Lovable Cloud database:

- Tables: `staff_audit_log`, `swychr_cards`, `swychr_payin_transactions`, `swychr_payout_transactions`
- Function: `sweep_fx_clearing_to_gain_loss()`

Their migration files exist in `supabase/migrations/` (from `20260615…_staff_onboarding.sql`, `20260701140000_fx_clearing_sweep.sql`, `20260717100000_swychr.sql`) but never ran successfully against the current DB. Because they're missing, the auto-generated `src/integrations/supabase/types.ts` doesn't know about them, so every `.from('swychr_cards')`, `.from('staff_audit_log')`, `.rpc('sweep_fx_clearing_to_gain_loss')` fails typing — which cascades into the `SwychrTopUpCard` `status/amount/failure_reason` "does not exist" errors and the "Type instantiation is excessively deep" errors in `swychrPay.ts` / `TransferTrackingPage.tsx`.

**B. Three unrelated code-level type mismatches:**

1. `CanadaSendFlow.tsx:1479` — object literal for `editing` prop is missing `address` and `tel` (added to `Beneficiary` in the latest migration).
2. `Features.tsx:230, 268` — framer-motion `Variants` no longer accepts `ease: number[]`; it needs a fixed-length tuple or an easing string.

## Changes

### 1. New migration `supabase/migrations/20260720010000_restore_missing_objects.sql`

Re-declares the missing objects idempotently (safe if any partially exist):

- `CREATE TABLE IF NOT EXISTS public.staff_audit_log (…)` — copied verbatim from the staff-onboarding migration, plus its GRANTs, RLS enable, and policies (wrapped in `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$` for policies).
- `CREATE TABLE IF NOT EXISTS public.swychr_payin_transactions`, `swychr_payout_transactions`, `swychr_cardholders`, `swychr_cards`, `swychr_airtime_transactions` — copied from the swychr migration, plus GRANTs, RLS, policies.
- `CREATE OR REPLACE FUNCTION public.sweep_fx_clearing_to_gain_loss()` — copied from the fx_clearing_sweep migration.

Once applied, Lovable will regenerate `types.ts`, which resolves every "not assignable to `t4a_ytd_totals`" error, the `SwychrTopUpCard` column errors, and the two "Type instantiation is excessively deep" errors.

### 2. `src/components/send/CanadaSendFlow.tsx` (line ~1505)

Add the two now-required fields to the `editing` literal:

```ts
notes: null,
tags: [],
address: null,
tel: null,
```

### 3. `src/pages/Features.tsx` (lines 230, 268)

Replace `ease: [0.4, 0, 0.2, 1]` (typed as `number[]`) with the string easing that framer-motion accepts without a tuple cast:

```ts
transition: { duration: 0.5, ease: "easeOut" }
```

Applied to both variants blocks.

## Not changing

- Business logic, RLS policies, or the ledger.
- `types.ts` (auto-generated; regenerates from the migration).
- Any of the earlier trial-balance / purchases / send-flow behavior.

After these three changes the reported TS errors go to zero. I'll verify by re-reading the build after applying.
