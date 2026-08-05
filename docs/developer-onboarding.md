# Developer Onboarding Tab

A new "Developer" section in the Admin portal that lets authorized admins
onboard individual users and businesses on their behalf. The customer
always completes their own KYC through Sumsub/Persona at `kyc_tier=0` —
admins never approve KYC.

## Architecture

```
Admin opens Developer tab
        |
        v
OnboardUserWizard / OnboardBusinessWizard
        |
        v
admin-create-user / admin-create-business (edge function, service_role)
        |
        v
Supabase auth user created (email_confirm: false, random password)
        |
        v
handle_new_user trigger fires — but skips the welcome email because
raw_user_meta_data->>'onboarded_by_admin' = 'true'
        |
        v
Edge function generates a recovery link via auth.admin.generateLink()
with redirectTo = /auth/reset-password
        |
        v
Edge function POSTs to send-email with type='admin_invitation' and the
recovery action_link. The user receives a single branded email.
        |
        v
Customer clicks link → ResetPasswordPage (clears any existing session
first) → sets password → lands in normal user flow
        |
        v
Customer does Sumsub/Persona themselves
        |
        v
on_kyc_status_change trigger fires → tier upgrade + account active
        |
        v
trg_notify_admin_on_user_claim fires (last_sign_in_at NULL → non-NULL)
→ admin_notifications row created → admin's bell icon updates via
realtime subscription
```

## What it does

- **Onboard User** — 3-step wizard (Identity / Address / Review). Creates
  a `profiles` row with `onboarded_via='admin'`, `onboarded_by_admin_id`,
  `onboarded_at`, `kyc_tier='tier_0'`, `kyc_status='pending'`,
  `account_status='pending_verification'`.
- **Onboard Business** — 5-step wizard (Business / Owner / UBOs / Review).
  Creates owner auth user + `customers` row + `customer_portal_access`
  link + `beneficial_owners` rows. UBO `ownership_pct` and `voting_pct`
  must each total exactly 100 (validated in UI + DB trigger).
- **Onboarded by Me** — lists users + businesses the current admin
  onboarded. Filter by claimed/unclaimed. Resend button calls
  `admin-resend-invite` to re-send the invite email and push the
  14-day orphan deadline.

## What it does NOT do

- Does **not** pre-approve KYC for the customer.
- Does **not** skip Sumsub/Persona.
- Does **not** allow the onboarding admin to also be the KYC approver
  (handled separately by the existing KYC review queue).
- Does **not** send bulk CSV imports in v1.
- Does **not** create business employees / multiple users per business
  in v1.

## Permission model

- New permission: `developer_onboarding` (added as an `AdminAction` enum
  value, granted to `super_admin`).
- Edge functions check `admin_users.role = 'super_admin'` (mirrors
  the frontend `hasPermission("developer_onboarding")`).
- The Developer nav group is gated behind this permission via the
  `requiresDeveloperOnboarding` flag on `NavItem` in
  `AdminLayout.tsx`.

## Database changes

All changes in `supabase/migrations/20260805210000_developer_onboarding.sql`
+ `20260805213000_admin_invitation_email_fix.sql`
+ `20260805220000_notify_admin_on_user_claim.sql`.

- `profiles` + `customers`: `onboarded_by_admin_id`, `onboarded_via`,
  `onboarded_at` columns.
- `beneficial_owners` trigger: validates `ownership_pct` and
  `voting_pct` totals = 100 per customer.
- `admin_orphaned_invitations` view: lists admin-onboarded users with
  no sign-in within 14 days.
- `handle_new_user` trigger: sends welcome email for self-signups only
  (skipped for admin-onboarded users).
- `trg_notify_admin_on_user_claim` trigger: inserts admin notification
  when onboarded user signs in for the first time.

## Edge functions

- `admin-create-user` — creates user with all onboarded_by fields.
  Sends `admin_invitation` email with the recovery link. Returns
  `email_warning` if the email send fails.
- `admin-create-business` — same, plus creates customer + portal_access
  + UBOs. Full rollback on any failure.
- `admin-resend-invite` — re-sends the invite email. Only works for
  `onboarded_via='admin'` accounts (prevents phishing).
- `admin-list-orphans` — queries the orphans view.
- `admin-cleanup-orphans` — deletes orphaned accounts older than 14 days.
  Logs every deletion to `audit_logs`. Can run as scheduled function.

## Email template

- `admin_invitation` added to `send-email` edge function. Branded email
  with a "Set up my account →" button that links to the recovery
  action_link. Falls back to a plain link.

## Configuration

In Supabase Studio → Authentication → URL Configuration → Redirect URLs,
add:
```
https://www.efin.money/auth/reset-password
```

Without this, the recovery link's redirect will be blocked.

## Rollout

1. Apply the 3 migrations to the target environment.
2. Deploy the 5 edge functions:
   ```bash
   supabase functions deploy admin-create-user
   supabase functions deploy admin-create-business
   supabase functions deploy admin-resend-invite
   supabase functions deploy admin-list-orphans
   supabase functions deploy admin-cleanup-orphans
   supabase functions deploy send-email
   ```
3. Add the redirect URL (see Configuration above).
4. Deploy the frontend (the new "Developer" nav group is gated on
   `hasPermission("developer_onboarding")` — invisible until granted).
5. Grant the permission to the rollout admin:
   ```sql
   UPDATE admin_users
   SET permissions = permissions || '{"developer_onboarding": true}'::jsonb
   WHERE id = '<admin-user-id>';
   ```
6. Manual test: onboard a user, confirm email, set password, verify
   tier_0.
7. Wait 1 week, then grant to 1-2 trusted admins.
8. After another week, expand to all super_admins (or compliance_officers
   per business decision).

**Rollback:** hide the entire feature with one SQL update (no deploy):
```sql
UPDATE admin_users
SET permissions = permissions - 'developer_onboarding'
WHERE permissions ? 'developer_onboarding';
```

## Bugs found and fixed during testing

1. **No email template** — `handle_new_user` called `invoke_send_email`
   with `type='admin_invitation'` but the template didn't exist. Added
   the template to `send-email`.
2. **Recovery link not sent** — `auth.admin.generateLink()` only
   generates the link, doesn't send the email. Edge function now
   calls `send-email` after generating.
3. **No redirectTo** — the recovery link went to Supabase's default
   redirect. Now passes `redirectTo: ${appUrl}/auth/reset-password`.
4. **Session conflict on reset-password page** — if the admin was
   already signed in, `getSession()` returned the admin's session
   and they could overwrite the wrong password. Now clears any
   existing session first when a recovery token is detected in the URL.
5. **Trigger sent 2 emails** — initially the trigger sent
   `admin_invitation` and the edge function sent another. Now the
   trigger skips admin-onboarded users; the edge function sends
   exactly one.
6. **No max on date of birth** — admin could enter future DOB. Added
   `max={today}` on date inputs.
7. **Country dropdowns not searchable** — added a reusable
   `CountrySelect` component (uses `SearchableSelect` with
   `ISO_COUNTRIES`).
8. **Form state leaked** — after submit, the wizard still had
   previous data. Now resets to `initial` state and step 0.
9. **Email failure was silent** — `admin-create-user` and
   `admin-create-business` now check the inner `send-email` response
   and return an `email_warning` field if it failed.

## Cleanup cron

The orphan cleanup is a function (`admin-cleanup-orphans`) that can be
triggered by Supabase scheduled functions or pg_cron. Recommended:
run daily at 03:00 UTC. Each deletion is logged to `audit_logs`.
