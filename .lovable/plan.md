## Goal

Give the admin CRM tab a complete, searchable record of everything that has happened on a user's account: every email/SMS sent, in-app notifications, support conversations, staff-logged calls and notes, staff edits, and account/security events.

## What exists today (verified)

- `customer_communications` table exists (channel, direction, subject, content, status, metadata) but is **completely empty** — nothing writes to it. `send-email` has no logging code at all.
- The CRM tab shows only two cards: in-app notifications and support conversations.
- `audit_logs` captures staff profile edits only (1 row today).
- No table records account/security events (logins, KYC transitions, wallet/card changes).

## Plan

### 1. Log every outbound message
- `send-email` writes a `customer_communications` row for each send: resolve `user_id` from the recipient email, `channel: email`, `direction: outbound`, `template_id` = email type, subject/content, `status` = sent or failed, provider message id + error in `metadata`.
- Same logging added wherever SMS/WhatsApp is dispatched, so all channels land in one table.
- Backfill is not possible (no historical send records), so the log starts from now.

### 2. Capture account activity
- New `account_activity` table: user_id, event_type, description, actor (user vs staff vs system), ip/user-agent, metadata, created_at. Grants + RLS: users read their own; admin/support/compliance read all; inserts via triggers/service role.
- Database triggers record: KYC status/tier changes, account status changes, wallet created/frozen, card issued/frozen/cancelled, transaction PIN set/changed, profile field changes.
- Sign-in / sign-out events recorded from the auth context so logins appear in the timeline.

### 3. Staff-logged interactions
- "Log interaction" button in the CRM tab: channel (phone call, email, WhatsApp, SMS, note), direction, subject, notes. Writes to `customer_communications` with the acting staff member as `created_by`.

### 4. Unified activity timeline UI
- New `UserActivityTimeline` component rendered in the CRM tab, merging five sources into one chronological feed: communications, notifications, support messages, `audit_logs`, `account_activity`.
- Channel/type filter chips (All · Email · SMS · In-app · Support · Account · Staff actions), text search, relative + absolute timestamps, actor attribution, and paging (load more).
- Existing notifications and support cards stay; the timeline sits above them as the master record.

## Technical notes

- One migration: create `account_activity` (+ grants, RLS, indexes) and the trigger functions; add indexes on `customer_communications(user_id, created_at)`.
- Logging in `send-email` is best-effort — a logging failure must never block or fail an email send.
- Timeline data is fetched through a single hook that runs the five queries in parallel and merges them client-side, keyed by user id.
