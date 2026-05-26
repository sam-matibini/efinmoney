# 3-Tier KYC Framework (New Users Only)

## Goal
Replace the current "verify everything upfront → jump to Tier 3" flow with a progressive 3-tier model (Minimal → Standard → Enhanced) aligned with FINTRAC. **Existing users keep their current tier and limits untouched** — all changes apply only to accounts created after this rollout.

## 1. Tier model (CAD)

| Tier | Label | Requirements | Max balance | Daily | Monthly |
|------|-------|--------------|-------------|-------|---------|
| 1 | Minimal | Phone + name + DOB + address (unverified) | $500 | $500 | $3,000 |
| 2 | Standard | Persona ID + selfie biometric | $3,000 | $3,000 | $3,000 |
| 3 | Enhanced | Tier 2 + proof of address + source of funds | $10,000+ | $5,000 | $10,000+ |

## 2. Database changes (single migration)

- New table `public.tier_limits (tier user_risk_tier PK, max_balance, daily_limit, monthly_limit, single_limit, features_enabled jsonb)` seeded with the three rows above; Tier 4 row retained for legacy/premium.
- New column `profiles.kyc_framework_version smallint default 2` (1 = legacy, 2 = new 3-tier). Backfill set to **1 for all existing rows**, so guards/trigger branches can preserve legacy behavior.
- Update `user_risk_tiers` default limits to `500 / 3000 / 500` (only affects new inserts; existing rows untouched).
- Rewrite `on_kyc_status_change` trigger:
  - For users with `kyc_framework_version = 2`:
    - ID-only Persona approval → Tier 2 (`3000/3000/3000`).
    - Address + source-of-funds approval (new fields below) → Tier 3 (`10000/10000/5000`, configurable).
  - For legacy users (`= 1`): keep current jump-to-Tier 3 behavior.
- Add columns on `kyc_verifications`: `source_of_funds_url`, `source_of_funds_type`, `source_of_funds_status`, `tier_target` (`tier_2` | `tier_3`).
- Add `handle_new_user` (signup trigger) update: insert `user_risk_tiers` row at `tier_1` with new defaults and stamp `kyc_framework_version = 2`.

## 3. Onboarding flow (new users)

```text
Signup ─▶ Tier 1 auto (instant wallet, no KYC gate)
   │
   ├─ User can: receive, P2P ≤ $500, bills, top-ups
   │
   ▼ trigger upgrade prompt when:
     · balance approaches $500
     · attempts send ≥ $500 (or any EFT ≥ $1,000)
     · attempts merchant/bank withdrawal
     ⇒ /onboarding/identity (Persona ID + selfie) → Tier 2
   │
   ▼ trigger Tier 3 prompt when:
     · attempts send > $3,000
     · enables business / international
     ⇒ /onboarding/enhanced (address doc + source-of-funds upload) → Tier 3 (pending review)
```

- **KYCGuard**: for `kyc_framework_version = 2`, do **not** redirect to `/onboarding/*` at login. Allow full app access at Tier 1; only block specific actions via limits. Legacy users keep current guard behavior.
- New page `src/pages/onboarding/Enhanced.tsx` for Tier 3 (address + source-of-funds uploader, reuses `DocumentUploader`).
- `Welcome.tsx` / `Identity.tsx` reframed as "Upgrade to Tier 2" rather than "Verify to use app".

## 4. Limit enforcement

- New helper `src/lib/tierLimits.ts` exporting `checkTransactionAllowed({ amount, userId })` that reads the user's tier + rolling daily/monthly spend from `ledger_entries` and returns `{ allowed, reason, requiredTier }`.
- Wire into send flows: `SendPage`, `CanadaSendFlow`, `EfinmoneyP2PFlow`, `ExchangePage`, withdrawal modals. On block, show a sheet: "Upgrade to Tier 2 to send more" with CTA to `/onboarding/identity`.
- Server-side mirror: edge functions `execute-transfer`, `intra-ca-transfer-create`, `pawapay-payout`, `paysafe-payout`, `stripe-charge-card` add a tier check before posting ledger entries.

## 5. UI updates

- `TierBadge` labels: `Tier 1 · Minimal`, `Tier 2 · Standard`, `Tier 3 · Enhanced` (keep Tier 4 fallback).
- New `TierProgressCard` on dashboard showing current tier, headroom against daily/monthly limits, "Upgrade" CTA.
- `KYCStatusCard` rewritten as `TierUpgradeCard` for v2 users (suggests next tier instead of "verify your account").

## 6. Risk & monitoring (lightweight first pass)

- Reuse existing `compliance-monitoring` edge function; add tier-aware rules:
  - Tier 1: velocity + geo/device mismatch alerts.
  - Tier 2: + structuring (split deposits near $1,000), counterparty risk.
  - Tier 3: + EFT ≥ $10,000 → auto-queue LCTR/EFT report row in `regulatory_reports`.
- No new reporting integrations in this pass — just queue rows; staff already review via Operations dashboard.

## Out of scope (call out for follow-ups)
- Actual FINTRAC report submission (we only queue rows).
- Independent effectiveness review tooling.
- Beneficial-ownership / business KYC flow (would be Tier 3 business variant).
- Training program tracking.

## Technical summary
- 1 migration: `tier_limits` table + seeds, `profiles.kyc_framework_version`, `user_risk_tiers` default change, new `kyc_verifications` SoF columns, rewritten `on_kyc_status_change` + `handle_new_user`.
- Frontend: new `Enhanced.tsx` onboarding page, `tierLimits.ts` helper, `TierProgressCard`, updated `KYCGuard` / `KYCStatusCard` / `TierBadge`, send-flow guards.
- Edge functions: tier check helper added to transfer/payout/charge functions.
- All branching keyed off `kyc_framework_version` so the 27 existing Tier 3 users see zero change.

## Open questions
1. Should existing users be offered an opt-in migration to v2 (so they get the progressive flow), or stay on legacy forever?
2. For Tier 3 source-of-funds, do you want auto-approval if Persona returns clean, or always manual compliance review? (FINTRAC EDD usually implies manual.)
3. Confirm exact Tier 3 ceilings — spec says "$10,000+" / "$10,000+ monthly". Use `10000 / 10000 / 5000` as defaults and let admins raise per-user in CRM?
