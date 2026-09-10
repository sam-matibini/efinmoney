# Wallet transfer: ledger_entries RLS and FX execution

**Incident:** CAD → USDC (e.g. C$3 → USDC 2.15) fails with:

`new row violates row-level security policy for table "ledger_entries"`

**Surfaces:** Transfer between wallets (`src/components/modals/WalletTransferModal.tsx`) and Live exchange (`src/pages/ExchangePage.tsx`). Both call `executeWalletFxSwap` in `src/lib/walletTransfer.ts`.

Work these phases in order. Do not skip P0 for P1.

---

## P0 — Fix the immediate error

### 1. Inspect `ledger_entries` RLS

In the production SQL editor (project `dkdnwumllibwdlqbjkwy`):

```sql
SELECT pol.polname,
       pol.polcmd,
       pg_get_expr(pol.polqual, pol.polrelid)  AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname = 'ledger_entries'
ORDER BY pol.polname;
```

Also confirm RLS is on and which roles may INSERT:

```sql
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relname = 'ledger_entries';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'ledger_entries';
```

**Expected production state (before P0):**

| Policy | Command | Who |
| --- | --- | --- |
| `Staff ledger inserts only` | INSERT | `finance` or `admin` only |
| `Users can view own ledger entries` | SELECT | wallet owner, finance, admin |

Consumer inserts are rejected. `execute_fx_swap` is `SECURITY DEFINER` and should bypass RLS; the failing path is the **client** insert in `postFxSwapLedger()`.

Repo already contains a proposed policy in `supabase/migrations/20260910230000_ledger_entries_own_wallet_insert.sql`. Confirm whether that migration has been applied. If `Users insert own wallet ledger entries` is missing, it has not.

### 2. Identify the failing INSERT

Reproduce CAD → USDC Transfer now. Then check which writer failed.

**A. Client fallback (current toast):** `postFxSwapLedger()` in `src/lib/walletTransfer.ts` does:

```ts
await supabase.from("ledger_entries").insert(rows);
```

Rows are:

- Debit CAD, `wallet_id` = source wallet, `created_by` = `auth.uid()`
- Credit USDC, `wallet_id` = destination wallet, `created_by` = `auth.uid()`

That INSERT runs as `authenticated`. It must satisfy an INSERT policy. Staff-only INSERT is why the toast appears.

**B. RPC path:** `public.execute_fx_swap(...)` (latest in `supabase/migrations/20260910220000_ensure_customer_wallet_liability.sql`) inserts the same legs as the table owner. If this RPC is live and USDC has a 21xx liability account, the client insert should not run.

**C. Trigger path:** `enforce_journal_currency_balance` inserts FX-clearing rows with `wallet_id IS NULL`. Those fail staff-only INSERT unless the trigger is `SECURITY DEFINER`.

Log Postgres / API errors around the attempt. Match `code` `42501` (RLS) vs `23502` (null `account_id`).

### 3. Confirm the authenticated user's `auth.uid()`

In the browser session that clicks Transfer now:

```ts
const { data: { user } } = await supabase.auth.getUser();
console.log(user.id);
```

In SQL, as that user (or with their UUID):

```sql
SELECT auth.uid(); -- only works in a request that carries their JWT

SELECT id, email
FROM auth.users
WHERE email = '<the account used in the screenshot>';
```

Record `v_user_id`. The screenshot user is a consumer, not staff. `has_role(uid, 'admin')` and `has_role(uid, 'finance')` should be false.

```sql
SELECT role
FROM public.user_roles
WHERE user_id = '<v_user_id>';
```

### 4. Confirm source and destination wallet ownership

```sql
SELECT w.id, w.user_id, w.currency_code, w.status
FROM public.wallets w
WHERE w.user_id = '<v_user_id>'
  AND w.currency_code IN ('CAD', 'USDC');
```

Both wallets must:

- belong to `v_user_id`
- be `status = 'active'`
- be different `id`s

CAD balance for C$3:

```sql
SELECT public.get_wallet_balance('<cad_wallet_id>');
```

Must be ≥ 3.

If either wallet `user_id` ≠ `auth.uid()`, a correctly scoped policy must deny the INSERT.

### 5. Create a properly scoped INSERT RLS policy

Do **not** restore `WITH CHECK (true)` or “any authenticated user may insert any ledger row.”

Apply (or re-apply) this shape — already in `20260910230000_ledger_entries_own_wallet_insert.sql`:

1. Keep `Staff ledger inserts only` for finance/admin (including `wallet_id IS NULL` system legs).
2. Add a **second PERMISSIVE** INSERT policy for consumers:

   - `TO authenticated`
   - `created_by = auth.uid()`
   - `wallet_id IS NOT NULL`
   - `wallet_id` exists on `wallets` with `user_id = auth.uid()`

3. Set `enforce_journal_currency_balance` to `SECURITY DEFINER` with `search_path = public` so FX-clearing legs (`wallet_id` NULL) are not evaluated as the consumer.

Also confirm USDC has a customer-wallet liability account (`ensure_customer_wallet_liability('USDC')` / seed `2117`). A successful INSERT still needs a non-null `account_id`.

Run the migration on production. GitHub `main` alone does not change RLS.

### 6. Test authorized and unauthorized inserts

**Authorized (must succeed):**

- Same user, own CAD wallet debit + own USDC wallet credit, `created_by = auth.uid()`.
- Transfer between wallets: CAD C$3 → USDC, quote ~`1 CAD = 0.7213 USDC`, receive USDC 2.15.
- Live exchange: same pair via Exchange Now.
- After success: CAD balance down ~3, USDC balance up ~2.15.

**Unauthorized (must fail with RLS / RPC exception):**

- INSERT a row whose `wallet_id` is another user’s wallet.
- INSERT a row with `wallet_id IS NULL` as a consumer (fee / clearing). Must fail for the client role; only DEFINER functions/staff may do that.
- INSERT with `created_by` ≠ `auth.uid()`.
- Call `execute_fx_swap` with another user’s `p_user_id` or wallets.

Use two test accounts. Do not test only as admin.

---

## P1 — Secure the transfer

Do this after P0 so customers are not blocked. Then remove the client write path.

### 1. Move transfer execution to a Supabase RPC / database function

Single writer: `public.execute_fx_swap` (already exists). Wire **only** this from the app:

- `src/lib/walletTransfer.ts` — delete `postFxSwapLedger` and any `supabase.from("ledger_entries").insert(...)`.
- `src/pages/ExchangePage.tsx`, `src/components/modals/ExchangeModal.tsx`, `src/hooks/useWalletTransfer.tsx` — keep calling `executeWalletFxSwap`, which must only `rpc('execute_fx_swap')` (and optionally `fx-engine` if that RPC is the implementation).

`fx-engine` may stay as a rate/limit façade, but it must not insert `ledger_entries` as the JWT user. It should call the same DEFINER function.

### 2. Validate ownership server-side

Already in `execute_fx_swap`:

- `auth.uid()` is not null
- `auth.uid() = p_user_id`
- both wallets exist and `user_id = auth.uid()`

Keep these checks. Do not trust `from_wallet_id` / `to_wallet_id` from the client beyond passing them into the RPC.

### 3. Validate available balance server-side

Inside the same function, before posting:

```sql
IF public.get_wallet_balance(p_from_wallet_id) < p_from_amount THEN
  RAISE EXCEPTION 'Insufficient wallet balance';
END IF;
```

Do not rely on the UI `Available: C$48.44` check.

### 4. Recalculate FX and fees server-side

Do not accept `p_effective_rate` / `p_fee_amount` from the client as the source of truth.

Inside the RPC (or `fx-engine` then pass into the RPC only after server quote):

- Resolve CAD→USDC from live `fx_rates` (`valid_until IS NULL OR valid_until > now()`), USD peg for USDC/USDT, same rules as `src/lib/fxRatesCore.ts`.
- Fee from `resolve_customer_price` (`payment_method = 'fx_swap'`) or a single documented rate card — not a client `0.005`.
- Compute `to_amount = (from_amount - fee) * effective_rate`.

Reject if the client-supplied rate differs from the server quote beyond a small epsilon, or ignore client rate entirely.

### 5. Create ledger entries and balance changes atomically

One transaction, one `journal_id`:

- Debit source wallet (CAD liability)
- Credit destination wallet (USDC liability) — account from `ensure_customer_wallet_liability`
- Credit fee revenue (`4100`) if fee > 0
- Let FX-clearing trigger balance currencies **as DEFINER**

`get_wallet_balance` is `SUM(credit) - SUM(debit)` on `wallet_id`. There is no separate wallet.balance column to update. Atomic ledger insert **is** the balance change. Wrap in a single function so a failure rolls back all legs.

### 6. Prevent duplicate transfers with an idempotency / transaction reference

Add a client-generated idempotency key (UUID) on Transfer now / Exchange Now. Pass it into the RPC.

Store it uniquely, e.g. `ledger_entries.external_reference` (already indexed with `reference_type`) or a new `fx_transactions.idempotency_key UNIQUE`.

On retry with the same key, return the original `journal_id` / transaction; do not post a second journal.

---

## P2 — Financial controls

### 1. Ensure every transfer has a unique transaction ID

- `journal_id` (UUID) on every `ledger_entries` row for the swap
- `fx_transactions.id` (or equivalent) stored and shown on the success screen
- Idempotency key from P1 maps 1:1 to that transaction ID

### 2. Create balanced debit/credit ledger entries

Per journal, per currency, `SUM(debit) ≈ SUM(credit)` (existing `enforce_journal_currency_balance`).

CAD→USDC must not leave an unposted CAD debit without a CAD clearing credit. Confirm after a test swap:

```sql
SELECT journal_id, currency_code,
       SUM(debit_amount) AS dr, SUM(credit_amount) AS cr
FROM public.ledger_entries
WHERE journal_id = '<journal_id>'
GROUP BY 1, 2;
```

### 3. Keep an immutable audit trail

- `created_at`, `created_by`, `journal_id`, `reference_type = 'fx'`
- Persist quote snapshot on `fx_transactions`: `from_amount`, `to_amount`, `effective_rate`, `fee_amount`, `market_rate`

No UPDATE of posted amounts.

### 4. Prevent users from modifying / deleting posted ledger entries

Add (if missing):

```sql
-- no consumer UPDATE/DELETE
REVOKE UPDATE, DELETE ON public.ledger_entries FROM authenticated;

-- explicit deny via RLS
CREATE POLICY "Ledger entries are immutable"
ON public.ledger_entries
FOR UPDATE TO authenticated
USING (false);

CREATE POLICY "Ledger entries cannot be deleted"
ON public.ledger_entries
FOR DELETE TO authenticated
USING (false);
```

Corrections = reversing journal, not edits. Staff exceptions only via a separate DEFINER tool if ever required.

### 5. Add reconciliation between wallet balances and ledger balances

`get_wallet_balance(wallet_id)` already is the ledger sum. Reconciliation job:

- For each wallet: `get_wallet_balance(id)` vs sum of that wallet’s `ledger_entries`
- For each currency: customer 21xx liability vs sum of wallet credits−debits
- Alert on drift > 0.01 (or currency precision)

Schedule via existing `pg_cron` / ops dashboard. Do not cache a writable `wallets.balance`.

### 6. Add appropriate RLS policies for SELECT, INSERT, UPDATE, and DELETE

| Command | `authenticated` (consumer) | finance / admin |
| --- | --- | --- |
| SELECT | rows where `wallet_id` is one of their wallets | all rows (trial balance) |
| INSERT | none from the client after P1; only DEFINER RPC | staff policy and/or DEFINER |
| UPDATE | deny | deny (or DEFINER reverse only) |
| DELETE | deny | deny |

After P1, prefer **no consumer INSERT policy** at all: drop `Users insert own wallet ledger entries` once `postFxSwapLedger` is gone, and leave only staff INSERT + DEFINER functions. That is the end state. P0’s consumer INSERT policy is a temporary unblock, not the long-term control.

---

## Suggested implementation order on this repo

| Phase | Code / SQL |
| --- | --- |
| P0 | Apply `20260910220000_ensure_customer_wallet_liability.sql` and `20260910230000_ledger_entries_own_wallet_insert.sql` on production. Re-test CAD → USDC. |
| P1 | Rewrite `executeWalletFxSwap` to RPC-only; extend `execute_fx_swap` with server rate, balance check, idempotency. Deploy function. |
| P2 | Immutable ledger RLS; unique tx id on UI; reconciliation query/job. |

**Do not** wait for a frontend-only Vercel deploy to fix RLS. Policies change only when SQL is executed on the database.
