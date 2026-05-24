## Goal
Show a branded loading animation (using the eFinMoney logo) while the Interac verification flow is connecting/redirecting, instead of the plain spinner currently in the button.

## Changes

### 1. Save the uploaded icon
- Copy `user-uploads://Icon.png` → `src/assets/efin-icon.png` (kept separate from existing `efin-logo.png` so the gold-on-blue mark is available for branded states).

### 2. New component: `src/components/ui/LogoLoader.tsx`
A reusable branded loader:
- Centered eFinMoney icon (from `src/assets/efin-icon.png`).
- Outer rotating conic-gradient ring in emerald/primary tones.
- Inner pulsing glow halo.
- Subtle floating/breathing motion on the logo itself (framer-motion).
- Optional `label` prop (e.g. "Connecting to Interac…") with animated dots.
- Sizes: `sm | md | lg`, default `md` (~96px).

### 3. Wire into Interac flow — `src/components/kyc/InteracVerification.tsx`
- While `loading` is true OR after we have the `authorization_url` and are about to `window.location.href = …`, render a full-card overlay (or replace the button area) with `<LogoLoader label="Connecting to Interac…" />`.
- Keep the existing button as the trigger; once clicked, swap to the loader state until the browser navigates away.
- Add a graceful "Taking longer than expected…" secondary text after ~6s (so a stalled redirect still feels intentional).

### 4. Wire into the post-redirect return — `src/pages/onboarding/Identity.tsx`
- When `searchParams.get("interac") === "success"` we already toast + navigate. Briefly show the same `<LogoLoader label="Finalizing verification…" />` as an overlay during that handoff (currently it's invisible work).

## Out of scope
- No backend changes, no Interac SDK changes, no routing changes.
- Error CTA work from the previous turn stays as already planned/implemented.

## Visual direction
- Emerald primary ring (`hsl(var(--primary))`) matching the existing Interac card border.
- Logo at rest with gentle `y` float (reuses the motion vocabulary already in `src/components/Logo.tsx`).
- Dark-theme friendly; works on both the white Interac card and any overlay backdrop.
