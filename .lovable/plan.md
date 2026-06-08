# Fix the spinning UI (permission denied for table transfers)

## Root cause

Migration `20260608043959` was meant to hide sensitive columns from the client by doing:

```sql
REVOKE SELECT ON public.<table> FROM authenticated;
GRANT  SELECT (col1, col2, …) ON public.<table> TO authenticated;
```

That works only when the client lists columns explicitly. Our hooks use PostgREST's `.select('*')` (e.g. `useTransfers`, `useProfile`, `useKyc`, etc.), which needs **table-level** SELECT. Every read on the 5 affected tables now fails with `42501`. The dashboard, transfers list, KYC guard and others spin forever because their queries never resolve.

Verified in DB:
- `pg_class.relacl` for `public.transfers` shows `authenticated=awdDxtm` (no `r`).
- Console: `permission denied for table transfers` repeating every few seconds.

## Fix

Add a new migration that **restores table-level SELECT for `authenticated`** on the 5 tables. Sensitive data stays protected by the existing RLS policies (rows already scoped to `auth.uid()` / admin role). True column-level secrecy will be handled in a follow-up via dedicated views, not column grants.

### Migration (new file)

```sql
-- Restore table-level SELECT broken by 20260608043959.
-- RLS still scopes rows to the owner / admins; sensitive columns will be
-- moved behind views in a follow-up.
GRANT SELECT ON public.plaid_items                    TO authenticated;
GRANT SELECT ON public.transfers                      TO authenticated;
GRANT SELECT ON public.kyc_verifications              TO authenticated;
GRANT SELECT ON public.profiles                       TO authenticated;
GRANT SELECT ON public.crossmint_yellowcard_transfers TO authenticated;
```

No other code changes needed — once SELECT is restored, every existing query starts working again and the spinners clear.

## Follow-up (not in this fix)

To actually hide `access_token`, `interac_security_answer`, `internal_notes`, `stellar_seed_encrypted`, `crossmint_raw`, `yellowcard_raw`, etc. without breaking `select('*')`:
1. Create `*_safe` views that exclude sensitive columns, grant SELECT on the views to `authenticated`.
2. Move hooks to read from the views.
3. Keep base tables service-role only for those fields.

I'll also update `@security-memory` to record that column-grant masking is incompatible with the app's `select('*')` pattern and that view-based masking is the correct approach.

## Files touched

- `supabase/migrations/<new-timestamp>_restore-table-select.sql` (new)
- `mem://security/...` security memory note (rationale update)
