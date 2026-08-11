# Add Flovide as Partner EFN0014 (Canada)

## What was confirmed

- `payment_partners` currently holds 13 partners, EFN0001–EFN0013; the next reference (EFN0014) is auto-assigned by the existing trigger.
- `partner_pricing` supports fixed fees, percentage fees, tiered schedules (`tiers` jsonb), fee currency, and a source reference — enough to hold the Flovide rate card.
- Account-level charges that are not per-transaction (onboarding, monthly minimums) have no dedicated column; the existing pattern for this is a `system_settings` entry (already used for the GPS platform fees).

## Rate card being loaded (from the Flovide commercial pricing sheet)

- Onboarding fee: CAD 0
- Monthly minimum: CAD 500 (month 1), CAD 1,000 (month 2 onwards)
- Collections: CAD 1.30 per transaction
- Payouts: CAD 1.80 per transaction
- Volume-based processing fee on aggregate monthly volume:
  - below CAD 1,000,000 → 0.25%
  - CAD 1,000,000 – 3,000,000 → 0.20%
  - above CAD 3,000,000 → 0.15%
  - default 0.25% until monthly reconciliation; overcharges credited to the wallet within 14 days

## Steps

1. Insert the partner record: name Flovide, code `flovide`, country CA, direction both, settlement currency CAD, supported country CA, currency CAD, status active, integration/API status pending (no API wired yet). Contract terms (monthly minimums, reconciliation/credit-back window, default 0.25% tier) recorded in `notes`.
2. Add two Canada corridors: CAD→CAD payin (collections) and CAD→CAD payout, so pricing and routing rows have something to attach to.
3. Insert two `partner_pricing` rows effective today, fee currency CAD, source `manual`, source reference "Flovide Commercial Pricing – Canada":
   - payin / collections: fixed CAD 1.30 + 0.25% default processing fee, with the three volume tiers stored in `tiers`
   - payout: fixed CAD 1.80 + 0.25% default processing fee, same tier schedule
   - FX markup 0 bps (CAD→CAD, no conversion)
4. Record the account-level fees (onboarding 0, monthly minimum 500/1,000, tier schedule, 14-day reconciliation credit) in `system_settings` under a `flovide_commercial_terms` key so the finance panel and future reconciliation logic can read them.
5. Verify: re-read the partner row (confirm EFN0014 assigned), the two corridors, and the two pricing rows with their tier JSON, then confirm Flovide appears in Admin → Pricing → Partners & Routing with the correct code and Serves badge.

## Assumptions to flag

- Flovide is treated as a Canada-domestic collections + payouts partner (CAD only) with no live API integration yet, so it is created with `integration_status = pending` and no function slugs — it will not be picked by the routing engine until enabled.
- The volume-based processing fee is modelled as a percentage fee on top of the per-transaction fixed fee (fee type hybrid), matching how tiered partner schedules are already stored.

If Flovide also covers other countries, methods (Interac / EFT / card), or should go live in routing immediately, say so and those details go in before the data is written.
