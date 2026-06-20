## Problem to fix

The app preview is sitting on the branded spinner because the current initial render waits too long before showing the route. The performance profile shows the page eventually loads, but it is heavy for preview/dev mode:

- Full page load is around 13.5s.
- DOMContentLoaded is around 9.7s.
- The preview loads about 247 script resources before becoming fully ready.
- `App.tsx` eagerly imports every page/admin/dashboard/payment module, so even a public landing-page preview downloads code for routes the user is not viewing.
- `SplashScreen` waits for the full `window.load` event, so slow non-critical resources can keep the spinner visible.

## Plan

1. **Unblock the splash screen**
   - Change `SplashScreen` so it hides after React is mounted and a short minimum brand display, instead of waiting for the full browser `load` event.
   - Keep the branded spinner feature, but add a hard maximum timeout so it cannot trap users on the loading screen.

2. **Make route loading responsive**
   - Convert heavy route/page imports in `App.tsx` to `React.lazy` with `Suspense`.
   - Keep the root landing route available immediately, while admin, finance, operations, dashboard, wallets, send, cards, KYC, payment, and settings pages load only when visited.
   - Use the existing `LoadingSpinner` as the fallback so the visual loading experience remains consistent.

3. **Avoid auth blocking the public landing page longer than necessary**
   - Add a brief failsafe around auth initialization so the public route can render instead of showing an indefinite spinner if session restoration is slow in preview.
   - Preserve protected-route security: authenticated-only pages still redirect or wait as needed.

4. **Reduce landing-page main-thread work without removing features**
   - Lazy-load heavier landing sections/components that are below the first viewport, while keeping the hero, calculator, and market ticker functional.
   - This preserves the full landing page but improves first preview responsiveness.

5. **Validate**
   - Re-open `/` in preview.
   - Confirm the spinner disappears quickly and the landing page is interactive.
   - Re-check console/network/performance signals for errors and obvious regressions.

## Expected result

The app should still show the branded spinner briefly, but it should no longer feel stuck on the spinning banner. The preview should render the landing experience faster, and the rest of the app should remain available through lazy-loaded routes.