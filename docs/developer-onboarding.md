# Developer Onboarding Tab

> Status: **Draft — pending boss confirmation** (Phase 0)
> Branch: `feat/developer-onboarding-tab`
> Owner: TBD

## What it is

A new "Developer" section in the Admin portal that lets authorized admins
onboard individual users and businesses on behalf of a customer. The admin
collects identity, address, and (for businesses) UBO data, then the customer
receives an email to set their password and complete KYC themselves.

The admin **does not** approve KYC. The customer always completes their own
KYC through the existing Sumsub / Persona flow, and the `verified_by` /
`kyc_verified_by` columns are populated by the customer's own auth context
(or the vendor webhook) — never by the onboarding admin.

## Why tier 0

Per the boss's clarification, the customer lands at `kyc_tier='tier_0'`,
`account_status='pending_verification'`, and upgrades automatically through
the existing `on_kyc_status_change` trigger after they finish their own KYC.
This:

- Keeps the admin out of the KYC decision (clean separation of duties)
- Means we don't need to touch `verified_by` / `verification_method` at all
- Reuses the existing user-side onboarding flow unchanged

## Architecture summary

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
Supabase auth user created
        |
        v
handle_new_user trigger fires -> profile + wallets + risk_tier + kyc_verifications
        |
        v
Recovery email sent (custom "admin_invitation" template)
        |
        v
Customer clicks link -> sets password -> lands in normal onboarding
        |
        v
Customer does Sumsub/Persona themselves
        |
        v
on_kyc_status_change trigger -> tier upgrade, account active
        |
        v
Notification fires to the onboarding admin (admin_notifications)
```

## What it does NOT do

- Does **not** pre-approve KYC for the customer
- Does **not** skip Sumsub / Persona
- Does **not** allow the onboarding admin to also be the KYC approver
- Does **not** send bulk CSV imports in v1
- Does **not** create business employees / multiple users per business in v1

## Permission model

- New permission: `developer_onboarding` (boolean in `admin_users.permissions` jsonb)
- Checked in every new edge function and every new page
- Defaults: `super_admin` only (pending boss confirmation)
- **Rollback**: `UPDATE admin_users SET permissions = permissions - 'developer_onboarding'`
  hides the entire feature in 1 SQL update

## Rollout

1. Merge to main
2. Grant permission to the feature owner only
3. Manual test in prod with a real email
4. Grant to 1-2 trusted admins, monitor 1 week
5. Expand to all `super_admin` (or `compliance_officer` per boss's answer)

---

## Boss confirmation message (copy-paste, Phase 0)

> Hi [boss name],
>
> Quick confirmations before I start on the Developer tab for admin onboarding:
>
> 1. **KYC flow**: admin creates the account at `kyc_tier=0`, the customer receives an invite email, and they complete KYC themselves (Sumsub/Persona). Tier auto-upgrades via the existing trigger. The admin does not pre-approve KYC.
> 2. **Bulk import**: one-at-a-time via the UI in v1, no CSV. (Or: include CSV bulk import in v1?)
> 3. **Welcome email**: use a custom "you've been invited by an eFinMoney admin" template. (Or: keep the generic welcome email?)
> 4. **Permissions**: `super_admin` only by default. (Or: also include `compliance_officer`?)
>
> Reply with answers and I'll start. If no reply by EOD I'll proceed with the defaults above (one-at-a-time, custom email, super_admin only).
