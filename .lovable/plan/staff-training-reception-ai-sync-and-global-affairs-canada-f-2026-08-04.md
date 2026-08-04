# Staff Training, Reception AI Sync, and Global Affairs Canada Feed

Three changes. Because your database is self-hosted Supabase, every schema change is given to you as SQL you paste into your own SQL Editor — I will not run migrations. App code and edge functions I change directly.

## Task 1 — Mandatory staff training (recommended design)

Today the training page is a flat catalogue plus a free list of completions. Anyone can only log their own completion, expiry is hardcoded to 12 months regardless of the course frequency, and there is no way to see who is out of compliance.

Recommended for eFinMoney (FINTRAC-facing):

- Seed five mandatory courses on first run: AML/ATF Fundamentals (12 mo), Sanctions & Screening (12 mo), Suspicious Transaction Reporting (12 mo), Privacy & PIPEDA (24 mo), Fraud & Security Awareness (12 mo).
- Mandatory courses apply automatically to every active staff member in `admin_users` — no manual assignment step.
- New "Compliance Matrix" card: rows = staff, columns = mandatory courses, cell state = Complete / Due soon (30 days) / Overdue / Never taken.
- Header KPIs become: staff fully compliant, staff overdue, certificates expiring in 30 days.
- Expiry is computed from the course's own `frequency_months`, not a fixed 12.
- "Log Completion" gets a staff picker so a compliance officer can record completion on behalf of someone else (self-only for non-admin roles).
- Optional per-course pass mark instead of the hardcoded 70%.

## Task 2 — Reception AI into the Support Inbox (recommended: webhook)

Recommendation is a webhook, since polling needs an API key and their public booking widget does not expose one.

- New edge function `reception-webhook` (public, shared-secret header check) that accepts a call/booking payload from Reception AI.
- Each call creates or reuses a support thread matched on caller email, otherwise phone, otherwise a new guest thread.
- Thread is tagged `channel = 'reception'`, subject from the booking/call reason, transcript or summary written as the first message, marked unread for staff, priority `high` when the payload flags a callback request.
- Support Inbox gets a "Reception AI" channel badge and a filter, so voice conversations sit next to app/contact/chat threads.
- If a booking has a scheduled time, it is included in the thread preview.
- You paste the webhook URL and secret into the Reception AI dashboard; if they cannot send webhooks, fallback is forwarding their summary emails into the same endpoint.

## Task 3 — Global Affairs Canada auto-pull (recommended: both, daily)

- Extend the existing `sanctions-sync` edge function with a `gac` source reading the Canadian Autonomous Sanctions List (SEMA) consolidated dataset published on open.canada.ca.
- Individuals and entities go into `aml_watchlist` with `source = 'gac'`, normalized names and aliases, so they screen through the existing KYC and transfer AML checks with no other change.
- Country-level: the sanctions programs are mapped to country codes and written back to `geographic_risk_ratings` as a new `canada_sanctions` flag, shown as a column on the Geographic Risk page next to UN and OFAC.
- Cadence: daily at 03:00 UTC via pg_cron, plus a "Sync now" button on the Sanctions Screening page.
- Sync run outcome (rows added/updated, errors) is recorded so an auditor can see the feed is live.

## SQL you run in your Supabase SQL Editor

I will hand you one script covering:

1. `training_courses` — add `pass_mark`, `applies_to_roles`; `training_records` — add `recorded_by`, index on `(staff_id, course_id)`.
2. Seed rows for the five mandatory courses (idempotent upsert on course name).
3. `support_threads` — allow `'reception'` in the channel check/enum, add `external_ref` and `external_source` columns with a unique index for idempotent webhook replays.
4. `aml_source` enum — add `'gac'`.
5. `geographic_risk_ratings` — add `canada_sanctions boolean default false`.
6. `sanctions_sync_runs` table (source, started_at, rows_upserted, status, error) with GRANTs and RLS for admin read.
7. `pg_cron` + `pg_net` enablement and the daily 03:00 UTC job calling `sanctions-sync`.

## Technical notes

- No new third-party packages. Reception webhook secret is stored as an edge function secret (`RECEPTION_WEBHOOK_SECRET`), which you add on your own Supabase project.
- `sanctions-sync` stays fault tolerant per source: a GAC outage does not block OFAC/UN.
- Compliance matrix is computed client-side from the two training tables, so no new views are required.

## Order of work

1. Give you the SQL script; you run it.
2. Training page rework.
3. `reception-webhook` function plus Support Inbox channel support.
4. GAC source in `sanctions-sync`, Geographic Risk column, sync-run logging.
