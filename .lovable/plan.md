## Hide Tier 4 from the UI

Tier 4 exists only as a leftover enum value in the database — the KYC approval logic (`on_kyc_status_change`) never assigns it, so it's always empty. Make Tier 3 the visible ceiling everywhere a user or admin sees tiers.

### UI changes
- `src/components/admin/RiskTiersPanel.tsx` — remove `tier_4` from `tierMeta` and from the distribution counter so the grid shows 3 cards.
- `src/pages/admin/AdminDashboardPage.tsx` — remove `tier_4: 0` from the tier counts initializer.
- `src/components/kyc/TierBadge.tsx` — drop the `tier_4` label entry.
- `src/components/admin-portal/Badges.tsx` — drop the `tier_4` color entry.
- `src/lib/tierLimits.ts` — narrow `Tier` to `"tier_1" | "tier_2" | "tier_3"`, remove `tier_4` from the upgrade-route map and label map. `nextTier("tier_3")` returns `null` (already the case).
- `src/hooks/useKyc.tsx` — narrow the `current_tier` type to the three tiers; drop the `|| tier_4` check in the refetch-interval (treat `tier_3` as the terminal tier).
- `src/components/cards/EfinCardsSection.tsx` — `tierOk` becomes just `tier?.current_tier === "tier_3"`.

### Not touched
- Database enum `user_risk_tier` keeps `tier_4` (removing Postgres enum values requires a destructive migration and is not needed since no row uses it). `src/integrations/supabase/types.ts` is auto-generated and reflects the DB — left as-is.
- No backend / RLS / ledger changes.

### Result
Risk Tiers admin page shows 3 distribution cards (Tier 1 / 2 / 3). Anywhere tiers are labeled, Tier 3 · Enhanced is the highest.
