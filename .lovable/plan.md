# Admin CRM Portal Build Plan

A full admin portal under `/admin/*` for managing KYC, users, risk tiers, and platform oversight. Sidebar + topbar layout, gated by `admin_users` table membership and roles.

## Scope confirmation

Before I start I want to confirm scope, because this is a very large build (8 pages, role guard, realtime, 3 edge functions, audit flows). I'd like to ship it in **two phases** to keep quality high:

**Phase 1 (this turn):**
- `/admin/login` + `AdminGuard` + `AdminAuthContext` (role + 30-min idle logout)
- Sidebar + topbar `AdminLayout`
- `/admin/dashboard` (KPIs, tier chart, recent activity, urgent reviews)
- `/admin/kyc` queue (filters, search, pagination, realtime)
- `/admin/kyc/[id]` review page (documents with signed URLs, approve/reject/request-info/escalate, internal notes, audit trail)
- Edge functions: `approve-kyc`, `reject-kyc`, `notify-user` (placeholder)
- DB additions needed below

**Phase 2 (next turn, after you approve Phase 1):**
- `/admin/users`, `/admin/users/[id]`
- `/admin/risk-tiers`
- `/admin/audit-log` (with CSV export)
- `/admin/settings` (notifications, integrations placeholder, admin user invites)

If you'd rather have everything in one shot, say so and I'll do it — but expect it to be larger and slower to verify. Otherwise I'll proceed with Phase 1.

## Database additions (Phase 1)

A small migration is required to support the review workflow without breaking existing tables:

- Add to `kyc_verifications` (nullable, additive only):
  - `internal_notes text`
  - `escalated boolean default false`
  - `escalated_at timestamptz`
- Add to `admin_users`: ensure `full_name text` exists (used in audit trail display); skip if already there.
- New table `admin_notifications` (per-admin notification feed for new submissions): `id, admin_id, type, payload jsonb, is_read, created_at`. RLS: admin can read their own.
- RLS updates on `kyc_verifications`:
  - Allow `is_kyc_reviewer(auth.uid())` SELECT/UPDATE on all rows (for review).
  - Keep existing user policies intact.
- RLS on `kyc_audit_log`: admins can SELECT all; INSERT allowed only when `auth.uid()` is reviewer; user can read their own (kept).
- Enable realtime on `kyc_verifications` (`ALTER PUBLICATION supabase_realtime ADD TABLE`).

No existing tables, columns, or policies will be removed or repurposed.

## Edge functions (Phase 1)

All under `supabase/functions/`, deployed automatically. Each validates JWT, checks `admin_users` membership + role, writes audit log, returns JSON.

- `approve-kyc` — body: `{ verification_id, scope: 'id_only' | 'id_and_address' }`. Updates the verification record; existing trigger handles tier upgrade + account number.
- `reject-kyc` — body: `{ verification_id, reason_code, custom_reason?, scope: 'id'|'address'|'both' }`. Updates rejection fields, sets status to `rejected`, audit logs.
- `notify-user` — placeholder; writes a row into `notifications` table for now (no actual email).

## Frontend architecture

- `src/contexts/AdminAuthContext.tsx` — wraps Supabase auth, fetches `admin_users` row, exposes `{ admin, role, signOut, hasPermission(action) }`. Tracks last activity; auto sign-out after 30 min idle.
- `src/components/admin-portal/AdminGuard.tsx` — redirects to `/admin/login` if not in `admin_users`; shows "Insufficient permissions" toast for forbidden actions.
- `src/components/admin-portal/AdminLayout.tsx` — sidebar (collapsible) + topbar (search, notifications bell with realtime badge, profile dropdown, theme toggle).
- `src/pages/admin/Login.tsx`, `Dashboard.tsx`, `KycQueue.tsx`, `KycReview.tsx`.
- Role permission helper `canApprove`, `canReject`, `canEditTiers`, etc., centralised.

### Routing
Add to `src/App.tsx`:
```
/admin/login                 → public (AdminLogin)
/admin                       → redirect to /admin/dashboard
/admin/dashboard             → AdminGuard + Dashboard
/admin/kyc                   → AdminGuard + KycQueue
/admin/kyc/:id               → AdminGuard + KycReview
```
Existing `/admin` route (current `AdminDashboard`) will be **moved** to `/admin/legacy` so the existing tabs page is preserved but the new portal owns `/admin`. (Confirm if you'd rather keep the old one removed; this seems safest.)

## Design

- Linear/Mercury feel: dense tables, sticky header, hover rows, thin dividers, semantic tokens from `index.css`.
- Status badges (pending=amber, approved=green, rejected=red, in_progress=blue, not_started=gray) and tier badges (1=gray, 2=blue, 3=purple, 4=amber) defined as small reusable components.
- Skeleton loaders, empty states with icons, sonner toasts for action feedback.
- Sidebar uses shadcn `Sidebar` primitives.

## Realtime

Subscribe in `AdminLayout` to `kyc_verifications` postgres_changes:
- On INSERT or UPDATE where `verification_status = 'pending_review'`: increment notification badge, push toast, invalidate React Query cache for queue.
- On any UPDATE: invalidate per-row queries so detail/list refresh without manual reload.

## Out of scope for Phase 1
- 2FA prompt UI, IP whitelist UI → Phase 2 (settings page).
- Tier override, audit-log CSV export, admin invites → Phase 2.
- Real email sending (Resend) — placeholder only as you specified.
- Persona OCR field extraction — placeholder fields.

## Confirm to proceed

Reply "go" to start Phase 1, or tell me to do everything in one shot / change the split.
