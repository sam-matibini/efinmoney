# Make all Settings tabs save

Today only **General Settings** persists (to the `system_settings` key/value table via `useSystemSettings`). Currencies, Partners/Routing, Circle CPN and Integrations already write to their own tables. The remaining Save buttons are cosmetic: they either do nothing or only show a toast.

## What is not saved today (verified in code)

| Panel | Section | Current behaviour |
|---|---|---|
| System Settings | Email Configuration | Uncontrolled inputs, Save button has no handler |
| System Settings | Notification Settings | Switches with `defaultChecked`, no handler |
| System Settings | Security Settings | Uncontrolled inputs, no handler |
| System Settings | Data Management | Uncontrolled inputs, no handler |
| Pricing & Fees | Competitor Benchmark | Uncontrolled inputs, no handler |
| Pricing & Fees | Transfer Fee Structure | Uncontrolled inputs, no handler |
| Module Access | Module toggles | Local `useState` only; save shows a success toast without writing |

## Approach

Reuse the existing `system_settings` key/value table and `useSystemSettings` hook for all of these — no new tables needed. Each section becomes controlled state hydrated from the store, with a save that upserts its own keys and shows success/error toasts, plus loading skeletons and admin-only editing (same pattern already used by the General card).

Key namespaces:

```text
email.smtp_host / smtp_port / smtp_user / footer_text
notifications.transaction_alerts / compliance_alerts / low_balance_alerts / daily_summary
security.require_2fa_admin / require_2fa_large_transfers / session_timeout_minutes /
         max_login_attempts / twofa_threshold_usd / password_expiry_days
data.audit_retention_days / transaction_retention_years / auto_backups
pricing.benchmarks (per-competitor margin + flat fee)
pricing.transfer_base_fee / transfer_percent_fee / transfer_max_fee
modules.<module_id>.enabled
```

Module Access keeps its static module catalogue (names, icons, roles) in code and stores only the enabled flags, so toggles survive reloads.

## Technical details

- Extend `useSystemSettings` with typed `getNumber` and `getBoolean` helpers alongside the existing `getString`; save path stays the single `saveSettings` upsert.
- Split `SystemSettingsPanel.tsx` into per-section card components (Email, Notifications, Security, Data) mirroring the existing `GeneralSettingsCard`, each with its own hydrate-on-load `useEffect` and save handler — keeps the file manageable.
- `PricingSettingsPanel.tsx`: add controlled state and save handlers for the Benchmark and Transfer Fee cards; the FX/crypto tables already persist and stay untouched.
- `ModuleAccessPanel.tsx`: hydrate `enabled` from settings, save all flags in one upsert.
- Writes are admin-only at the database level (existing RLS on `system_settings`); the UI disables inputs and save buttons for non-admins to match.
- **SMTP password**: not written to `system_settings` (that table is readable by any authenticated user). The field will be handled as a backend secret rather than a settings row, with the input labelled accordingly.
- No database migration required.
