## Fix: Monthly budget shows fake 65% for new users

**Root cause**
`src/components/dashboard/HeroBalance.tsx` line 96 hardcodes `const monthlyBudgetPct = 65; // decorative progress`. It was never wired to real data, so every user (including brand-new signups with $0 spent) sees "65% used".

## Change

Edit only `src/components/dashboard/HeroBalance.tsx`:

1. Remove the hardcoded `65`. Default `monthlyBudgetPct` to `0`.
2. Change the label from `"{pct}% used"` to:
   - `"Not set"` (muted text) when no budget exists
   - `"{pct}% used"` only once a real budget is configured
3. Render the `BudgetArc` with `pct={0}` so it shows an empty ring instead of a 65% filled arc.
4. Keep the arc visible (so the layout doesn't shift) but make it act as a "Set budget" affordance — clicking it is a no-op for now; we'll wire a real budget feature in a future task.

No DB changes, no new tables, no new hooks. Pure UI fix.

## Out of scope (future work)

- A real `user_budgets` table + settings page to let users set a monthly cap
- Computing actual spend from the ledger to drive the % once budgets exist

Both can come later as a proper feature; this PR just stops the dashboard from lying to new users.
