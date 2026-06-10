# Landing Page — Africa-First Refresh

Goal: Make the landing page more market-attractive and B2B-ready, while keeping the current deep purple + amber color scheme intact.

## Changes

### 1. African imagery (hero backdrop + new "Africa-first" band)
- Generate one wide cinematic African hero image (savanna + Victoria Falls + acacia silhouette + warm Lagos/Nairobi skyline blend) and place it as a low-opacity backdrop layer behind the existing purple grid hero. Color scheme stays — image sits at ~25% opacity blended with the existing purple/amber overlays.
- Add a new "Built for Africa" section directly under the hero with a single professional African landscape image on the left and a short B2B value paragraph on the right (corridors, mobile money rails, multi-currency settlement). Image is purely decorative; no color-scheme change.

### 2. Expand currencies on the phone mockups
Update `WalletScreen` to show 6 currencies instead of 3:
- USD, CAD, NGN, KES (Kenya), GHS (Ghana), ZMW (Zambia)
Update `SendScreen` corridor copy to cycle examples and use realistic mock balances. Update `ExchangeScreen` to keep USD→CAD (already shown) but add small "corridors" chips under it: NGN · KES · GHS · ZMW.

### 3. B2B professional phone hero image
- Generate one premium real-photo style image: a navy iPhone on a dark walnut desk next to a leather notebook and espresso, with the eFinMoney logo/wordmark on screen (matching the user's uploaded Cover_2 reference).
- Add a new "Built for Business" band between Features and How-it-works:
  - Left: the generated professional phone photo
  - Right: B2B copy — "Treasury, payouts, FX and reconciliation for African-facing businesses." + 3 bullet points (Bulk payouts, Multi-entity wallets, API & reporting) + "Talk to sales" CTA (amber pill, existing style).

### 4. Hero copy tweak (small)
Change pill text to "Africa-first. Global rails." and tagline subline to mention "Canada, USA, Nigeria, Kenya, Ghana, Zambia and 50+ corridors."

## Files touched
- `src/pages/Landing.tsx` — phone mockup data, new sections, hero backdrop layer, copy tweaks
- `src/assets/landing-africa-hero.jpg` (new, generated, then externalized via lovable-assets)
- `src/assets/landing-africa-band.jpg` (new, generated + externalized)
- `src/assets/landing-b2b-phone.jpg` (new, generated + externalized)

## Out of scope
- No color token changes (purple/amber preserved)
- No nav, footer, or routing changes
- No backend changes
