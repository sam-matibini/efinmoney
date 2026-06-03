# PureVPN-Inspired Visual Refresh

Goal: bring the polish, depth and brand confidence of purevpn.com/order to the entire eFinMoney UI — without changing any functionality.

## What I'm taking from the reference

- Deep purple/indigo gradient background (`#1a0b3d → #2d1670 → #4527a0`) with a faint grid + dot-map texture
- Bright **amber/yellow CTA** as the only warm accent (used sparingly for the primary action)
- Heavy display headlines, generous tracking, white-on-purple
- Floating "product screenshot" hero card with soft glow
- Pill-shaped buttons, soft inner-glow on the primary CTA
- Trust strip (press logos) sitting on the hero
- Clean white content sections below the dark hero, with purple accents

## Scope

### 1. Design tokens (`src/index.css` + `tailwind.config.ts`)
- Refine the purple/indigo scale so we have: `--brand-900` (hero bg), `--brand-700`, `--primary` (CTA purple), `--primary-glow`
- Add `--accent-amber` (`#FFB400`) + `--accent-amber-glow` for primary CTAs only
- Add `--gradient-hero-deep` and a reusable `bg-grid-purple` utility (CSS background grid + radial fade)
- Tighten shadow tokens (`--shadow-cta-amber`, `--shadow-card-purple`)
- Keep light-mode app clean; the deep-purple treatment is reserved for hero/landing surfaces

### 2. Landing page (`src/pages/Landing.tsx`)
- Replace current emerald-tinted hero with PureVPN-style deep-purple hero:
  - Grid + dot-world-map background
  - Large 2-line display headline ("Move money. Anywhere in Africa. Instantly.")
  - Subheadline + amber primary CTA + ghost secondary
  - Floating dashboard+phone mockup on the right (reuse existing PhoneFrame, restyle frame to match)
  - Press/trust strip beneath
- Keep existing sections (features, steps, stats, testimonials) but restyle:
  - Feature cards: white on light bg with purple icon chips
  - "How it works" steps: numbered amber circles on purple gradient band
  - Stats band: full-width deep-purple with grid texture
  - Footer CTA: amber button on purple

### 3. App dashboard hero (`src/components/dashboard/HeroBalance.tsx`)
- Wrap the balance card in the new deep-purple gradient + grid texture so the logged-in `/` matches the brand
- Sparkline + chips re-coloured to indigo/violet/amber
- Primary action ("Send") becomes the amber pill CTA

### 4. Global polish (touches only, no functional change)
- `Header.tsx`: tighten spacing, add subtle purple gradient on scroll
- `MobileNav.tsx`: active tab pill uses primary purple with amber dot indicator
- `QuickActions`, `WalletCarousel`, `MiniStats`: align gradients with new brand scale (remove any leftover greens already swept)
- Buttons: introduce `variant="cta"` (amber) in `button.tsx` for top-level conversion actions only
- Cards: standardise `rounded-2xl`, `shadow-card-purple`, hover lift

### 5. Page-level consistency pass
- `Auth.tsx`, `KYCPage`, `SendPage`, `ExchangePage`, `WalletsPage`, `CardsPage`, `MorePage`, `SettingsDashboard`: ensure they all sit on `bg-background`, use `PageHeader`, and any hero strips reuse the new `bg-grid-purple` utility
- No layout or content rewrites — just token + class swaps where colors/shadows look off

## Out of scope
- No backend, data, route, or copy changes
- No new pages, no new features
- Logo stays as-is (already indigo gradient)

## Technical notes
- All colors via HSL semantic tokens — zero hex in component files
- Grid background = single CSS utility class (`.bg-grid-purple`) defined once in `index.css`
- Amber CTA exposed as a `Button` variant so future pages stay consistent
- Framer-motion entrances kept; only tokens change

## File checklist
```
src/index.css                              tokens + .bg-grid-purple utility
tailwind.config.ts                         expose brand-{700,900}, amber
src/components/ui/button.tsx               + variant "cta" (amber)
src/pages/Landing.tsx                      hero + sections restyle
src/components/dashboard/HeroBalance.tsx   deep-purple hero treatment
src/components/dashboard/QuickActions.tsx  color pass
src/components/dashboard/WalletCarousel.tsx gradient pass
src/components/dashboard/MiniStats.tsx     gradient pass
src/components/layout/Header.tsx           subtle polish
src/components/layout/MobileNav.tsx        active-pill polish
```

Ready to switch to build mode and ship it.