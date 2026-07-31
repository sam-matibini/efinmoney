## Goal

Let admin staff correct and update a user's information from the admin portal — both while the user is still onboarding and after — with identity fields locked behind admin-only editing once KYC is approved, and every change written to the audit trail.

## Current state (verified)

- `public.profiles` holds name, email, phone, address, tag, currency/country — but has **no** date-of-birth or occupation column.
- RLS already allows admins to update any profile ("Admins can update all profiles"); users can update their own.
- `/profile` (ProfileSettingsPage) is the user's self-service editor; it has no KYC lock — a verified user can still change their legal name/address today.
- Admin `/admin/users/:id` (UserDetailPage) is **read-only** — it renders profile rows but has no edit form.
- `AdminAuthContext` already defines an `edit_users` permission (super_admin + compliance_officer).
- `audit_logs` exists with an admin/compliance read policy and no insert policy — writes must come from the server.

## What gets built

### 1. Schema
Add to `profiles`: `date_of_birth` (date), `occupation` (text). No other structural change; `default_currency`, `address_country`, `country_code` already exist.

### 2. Server-side update path (`admin-update-user` edge function)
A single authenticated function that:
- verifies the caller is an active admin with `edit_users`;
- accepts a whitelist of editable fields (full name, email, phone, DOB, occupation, street/city/state/postal/country, default currency, eFin tag);
- validates input (E.164 phone, ISO-2 country, ISO-4217 currency, DOB ≥ 18 years and in the past, eFin tag pattern/uniqueness);
- writes the change with service role and records an `audit_logs` row (`action: 'admin_update_profile'`, `table_name: 'profiles'`, `record_id`, `old_data`, `new_data` diff, actor `user_id`);
- optionally updates the auth email when the email changes.

### 3. Admin UI — Edit user
On `/admin/users/:id`, add an **Edit** button on the header card opening a dialog (new `src/components/admin-portal/EditUserDialog.tsx`) with sections: Identity (name, DOB, occupation, email, phone), Address (street/city/state/postal/country combobox), Preferences (default currency, eFin tag). Save calls the edge function, invalidates the profile query, toasts the real error on failure. Button hidden/disabled unless `hasPermission("edit_users")`.

Also add a **Change history** block in the Overview tab listing that user's `audit_logs` entries (what changed, by whom, when).

### 4. KYC lock on the user's own profile
In `ProfileSettingsPage`, once `kyc_status === 'verified'` (or tier ≥ tier_1 with approved verification), the identity fields — full name, DOB, phone, and address — become read-only with an inline note: "Verified details can only be changed by support. Contact us to request a change." Tag, email, avatar and email preferences stay user-editable. The same rule is enforced server-side in a profiles `BEFORE UPDATE` trigger so a verified user can't change locked columns via the API — admin updates (service role / admin role) bypass it.

### 5. During onboarding
Onboarding stays user-editable (KYC not yet approved), and the same admin Edit dialog works for in-progress users, so staff can fix a typo before approving from the KYC queue. A "Edit user details" link is added to the KYC review page header pointing at the same dialog.

## Technical notes

- DOB/occupation are added to the `useProfile` select list and `Profile` interface.
- Currency options come from the existing `worldCurrencies.ts` / `CurrencyManagementPanel` source; countries from `ISO_COUNTRIES`.
- Phone normalisation reuses `normalizeToE164`.
- The lock trigger compares OLD/NEW on the locked columns only, and no-ops when `has_role(auth.uid(),'admin') or is_admin_user(auth.uid())`.

## Out of scope

- Changing a user's password or KYC decision (already handled by existing approve/reject flows).
- Bulk edits or CSV import of user data.
