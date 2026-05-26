## Problem

Clicking "Back to dashboard" from the wallet statement page produces a brief white/blank flash before the dashboard renders.

## Root cause

Two things stack up on every route change:

1. `AppRoutes` wraps every route in `<AnimatePresence mode="wait"><PageTransition key={pathname}>` (src/App.tsx:163-164). `mode="wait"` forces the outgoing page to fully exit (fade-out) before the new one mounts, which produces a visible empty frame between the two pages.
2. `/dashboard` is wrapped in `KycProtectedRoute` → `ProtectedRoute` → `KYCGuard`. On a fresh mount these guards re-run their loading checks and can render a spinner/null for a tick before `Index` paints, amplifying the flash.

## Fix

Smallest, lowest-risk change: switch the back button to use browser history instead of a fresh push, so React Router pops back to the already-mounted dashboard state and the guards don't remount from scratch.

- In `src/pages/WalletStatementPage.tsx`, change the back button handler from `navigate("/dashboard")` to:
  - `navigate(-1)` when `window.history.length > 1` and the previous entry is same-origin
  - fall back to `navigate("/dashboard")` when the user landed directly on the statement page (e.g. opened in a new tab)

This eliminates the second mount of `ProtectedRoute` + `KYCGuard` and lets the cached dashboard data render instantly. The `AnimatePresence` fade still runs, but with the destination component already warm it visually feels seamless rather than a blank flash.

If the blink is still noticeable after this change, the follow-up is to soften the page transition itself — either reduce `PageTransition`'s fade duration, or drop `mode="wait"` so the incoming page mounts under the outgoing one. That's a global change affecting every route, so I'd only do it if step 1 isn't enough.

## Files touched

- `src/pages/WalletStatementPage.tsx` — back button handler only.

No other pages, no styling, no routing config changes in step 1.
