## Goal

Bring existing (legacy v1) users onto the new 3-tier KYC framework. Keep their current tier assignment, but apply the new v2 limits from `tier_limits` so everyone is governed by the same rules.

## Changes

### 1. Data migration (single SQL migration)

- Set `profiles.kyc_framework_version = 2` for all existing users currently at v1.
- For every row in `user_risk_tiers`, overwrite `daily_transaction_limit`, `monthly_transaction_limit`, `single_transaction_limit`, and `features_enabled` with the values from `tier_limits` matching their `current_tier`.
  - Tier 1 → 500 / 3,000 / 500
  - Tier 2 → 3,000 / 3,000 / 3,000
  - Tier 3 → 10,000 / 10,000 / 5,000 (current v2 defaults)
  - Tier 4 → leave as-is (premium/manual)
- Users currently on legacy Tier 3 ($50k/$500k) will be reduced to the new v2 Tier 3 caps. They keep Tier 3 status (no KYC re-verification required), just new limits.

### 2. Trigger cleanup

- Simplify `on_kyc_status_change`: remove the v1 legacy branch that preserved $50k/$500k limits. After migration every user is v2, so the trigger always reads limits from `tier_limits`.

### 3. UI

- No additional UI work needed — `TierProgressCard`, `KYCGuard`, and `tierLimits.ts` already branch off `kyc_framework_version`. Once everyone is v2, they automatically see the new progress bars and upgrade CTAs.

## Out of scope

- No grandfathering of higher limits.
- No forced re-KYC; Tier 3 users stay at Tier 3.
- No notification/email blast about limit changes (can add later if you want).

## Confirmation needed

Active users who relied on the $50k daily / $500k monthly Tier 3 ceiling will now hit the new $10k daily cap. Confirm this is acceptable before I run the migration.
