## Goal

Surface each user's eFinMoney **account number** and **@efin_tag** in the admin Users table so admins can identify subscribers at a glance. No other behavior changes.

## Scope

Single file: `src/components/admin/UsersPanel.tsx` (rendered on `/admin/dashboard` → Users tab, and reused on `/admin/users`).

## Changes

1. **Extend the query** — add `account_number` and `efin_tag` to the `profiles` select in the `admin-profiles` query, and to the `UserProfile` interface.

2. **Add two table columns** between "User" and "KYC Status":
   - **Account #** — monospaced, shows `profile.account_number` or a muted `—` when null (Tier 0/1 users without one yet).
   - **eFin Tag** — shows `@{profile.efin_tag}` as a subtle badge, or `—` when null.

3. **Extend search** — include `account_number` and `efin_tag` in the existing `searchQuery` filter so admins can look users up by either field.

4. **Update `colSpan`** on the empty-state row from `7` to `9`.

## Out of scope

- No DB migration, no RLS change, no edge function — `profiles.account_number` and `profiles.efin_tag` already exist and the existing admin RLS already allows reading them.
- No changes to `UserDetailPage`, the CRM panels, or any user-facing screen.
- No copy/regenerate buttons — display only, per the request.
