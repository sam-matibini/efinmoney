## Schedule `elicate-reconcile` every 2 minutes

Set up a `pg_cron` job that calls the `elicate-reconcile` edge function every 2 minutes so any stuck ZMW transfer self-heals if Elicate misses a webhook delivery.

### Steps

1. Ensure `pg_cron` and `pg_net` extensions are enabled in the `extensions` schema (no-op if already present).
2. Unschedule any existing `elicate-reconcile-every-2min` job (idempotent re-run safety).
3. Create a cron job `elicate-reconcile-every-2min` on schedule `*/2 * * * *` that issues a `net.http_post` to:
   - `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/elicate-reconcile`
   - Headers: `Content-Type: application/json`, `Authorization: Bearer <anon key>`
   - Body: `{}` (function defaults to reconciling all processing ZMW transfers)

### Verification

- Query `cron.job` to confirm the row exists.
- After ~2 minutes, query `cron.job_run_details` for the latest run and check `status = 'succeeded'`.
- Check `elicate-reconcile` edge function logs for periodic invocations.

### Notes

- Webhook (`elicate-webhook`) remains the primary path; reconciler is the safety net.
- Function is idempotent: it only acts on transfers still in `processing` status with `target_currency = 'ZMW'`.
