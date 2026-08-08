# Fix the dashboard loading delay

The screenshot shows the dashboard sitting on a grey skeleton. That is not slow data — it is an all-or-nothing loading gate in front of the page.

## What is happening

`src/pages/Index.tsx` hides the entire dashboard behind `useDashboardReady()`. That hook only returns `true` after **all five** queries (`wallets`, `dashboard-transfers`, `profile`, `kyc`, plus the global `fx_rates`) have finished with status `success`. So:

- The page waits for the slowest query, even though nothing on screen needs `fx_rates` or `kyc` to draw the balance.
- If any one of those queries errors or stays disabled, `ready` never flips and the skeleton shows forever.
- The work is duplicated: `HeroBalance`, `WalletCarousel`, `RecentTransactions` and `ExchangeRates` each already render their own skeleton while their own query loads.

## The fix

1. Remove the whole-page gate from `Index.tsx`: render the real dashboard immediately, and let each section show its own skeleton (already implemented in every section).
2. Keep the page from flashing empty by relying on the existing per-section skeletons plus `SectionBoundary`, so a failing section degrades alone instead of blanking the page.
3. Delete `src/hooks/useDashboardReady.ts` (and its import) since nothing else uses it.
4. Warm the first paint: prefetch `profile`, `wallets` and `dashboard-transfers` on app bootstrap the same way `prefetchRoute` already does, so the hero balance has data on arrival rather than after mount.

Result: the header, hero, wallets and quick actions appear as soon as their own data lands, and a slow or failing `fx_rates`/`kyc` call no longer blocks the page.

## Technical notes

- Files touched: `src/pages/Index.tsx`, `src/hooks/useDashboardReady.ts` (removed), `src/providers/AppBootstrap.tsx` (prefetch warm-up).
- No backend, query, or business-logic changes — presentation and caching only.
- `DashboardSkeleton` stays in the repo for the route-level `Suspense` fallback.
