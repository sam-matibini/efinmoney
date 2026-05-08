## Goal
Convert the entire app from a dark theme to a polished light theme (keeping #10b981 green as the brand) and add Revolut/Wise-grade animations to the auth/landing page, dashboard, and global UI.

## 1. Global light theme (foundation)
Edit `src/index.css` to replace every CSS variable with light-theme HSL values. Because every component already uses semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`, …), flipping the tokens flips the whole app.

New tokens (HSL):
- `--background` 0 0% 100% (#FFFFFF)
- `--foreground` 222 47% 11% (#0F172A)
- `--card` 210 40% 96% (≈ #F1F5F9) with `--card-foreground` = foreground
- `--muted` 210 40% 96%, `--muted-foreground` 215 16% 47% (#475569)
- `--border` / `--input` 214 32% 91% (#E2E8F0)
- `--secondary` 210 40% 98% (#F8FAFC)
- `--primary` stays 160 84% 39% (#10b981), `--primary-foreground` white
- `--popover` white, `--sidebar-background` 210 40% 98%
- New shadows: `--shadow-card: 0 1px 3px hsl(222 47% 11% / 0.08)`, `--shadow-elevated: 0 10px 30px -10px hsl(222 47% 11% / 0.12)`, `--shadow-glow: 0 0 30px -8px hsl(160 84% 39% / 0.35)`
- Keep `--gradient-primary` as `linear-gradient(135deg,#10b981,#059669)`
- Update `--gradient-card` and `--gradient-hero` to light variants
- `.glass` utility → `bg-white/70 backdrop-blur-xl border-border`
- Remove the `.dark` override so the app stays light everywhere

## 2. Reusable animation primitives
Add to `tailwind.config.ts` (extending existing keyframes):
- `float`, `float-slow`, `bubble-up`, `shimmer`, `marquee`, `ripple`, `slide-in-left`, `slide-in-right`, `slide-up`, `count-up`, plus matching `animation` entries.
- New utility `.hover-lift` → `transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated`.
- `.skeleton-shimmer` utility using a gradient + `animate-shimmer`.
- `.story-link` underline animation (already documented).

Create small helpers:
- `src/components/ui/AnimatedNumber.tsx` — count-up using `framer-motion`'s `animate`/`useMotionValue` (framer-motion is already installed).
- `src/components/ui/PageTransition.tsx` — wraps route content in `motion.div` with fade/slide for page transitions; applied in `App.tsx` around routes.

## 3. Auth/landing page redesign (`src/pages/Auth.tsx`)
Left panel (green):
- Background `bg-gradient-to-br from-[hsl(160_84%_39%)] to-[hsl(160_84%_30%)]` with overlay radial highlight.
- Background layer: floating SVG icons (globe, dollar, euro, naira) using `motion.div` with `animate-float` at varying delays; absolute-positioned bubbles (12 small circles) animating upward with `animate-bubble-up` and randomized delays.
- Heading: framer-motion typewriter (character-by-character reveal) for the main title; subtitle slides up after.
- 3 feature cards (`💸 Instant Transfers`, `🔒 Bank-Grade Security`, `🌍 50+ Countries`) using `motion.div` with `slide-in-left` staggered (delay 0.3 / 0.5 / 0.7s), white/10 glass card style.
- Bottom: continuous marquee ticker with hard-coded sample FX pairs scrolling right-to-left via `animate-marquee` (CSS-only, duplicated content for seamless loop).

Right panel (form):
- White card with subtle border + soft shadow, fades in on mount.
- Inputs get focus ring glow: `focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary` plus a subtle `transition-shadow`.
- Sign In button: add ripple on click via small inline component (creates a `<span>` at click coords with `animate-ripple`).
- Below form: "Trusted by 10,000+ users across 50 countries" with flag emojis 🇨🇦 🇺🇸 🇬🇧 🇰🇪 🇳🇬 🇬🇭 🇿🇦.

## 4. Dashboard animations (`src/pages/Index.tsx` + dashboard components)
- `StatsOverview`: wrap each stat number in `<AnimatedNumber value={…} />` for the count-up effect.
- `WalletCarousel` / wallet list: each card wrapped in `motion.div` with `initial={{x:-20,opacity:0}} animate={{x:0,opacity:1}}` and `transition={{ delay: i*0.1 }}`.
- `QuickActions`: stagger fade-up (`initial={{y:20,opacity:0}}`, delay `i*0.08`).
- `RecentTransactions`: list items slide in from right with stagger.
- Pages: route-level `PageTransition` wrapper for fade between routes.

## 5. Global polish
- Update `src/components/ui/button.tsx` default + premium variants to add `transition-all hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0`.
- `src/components/ui/dialog.tsx` content already has Radix data-state animations; keep, but add `.scale-in` + `.fade-in` overrides via class to ensure scale 0.95→1.
- `src/components/ui/skeleton.tsx`: replace `animate-pulse` with the shimmer gradient utility for premium feel.
- Add `.story-link` class to nav links in `src/components/NavLink.tsx` and `src/components/layout/Header.tsx`.
- Hover on cards: add `hover-lift` class to `Card` usages where they're clickable (wallets, quick actions, dashboard cards).

## 6. Files touched
- `src/index.css` — full token + utility overhaul
- `tailwind.config.ts` — add keyframes/animations/utilities
- `src/components/ui/AnimatedNumber.tsx` (new)
- `src/components/ui/PageTransition.tsx` (new)
- `src/components/ui/RippleButton.tsx` (new, small wrapper used in Auth)
- `src/pages/Auth.tsx` — full redesign
- `src/App.tsx` — wrap routes in `PageTransition`
- `src/components/dashboard/StatsOverview.tsx`
- `src/components/dashboard/WalletCarousel.tsx`
- `src/components/dashboard/QuickActions.tsx`
- `src/components/dashboard/RecentTransactions.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/NavLink.tsx`

## Out of scope
- No backend, schema, or business-logic changes.
- No new design tokens beyond the light palette + a few animation utilities.
- No icon-library swap or font change (keeps Space Grotesk + Inter).
- Won't audit every component's hardcoded colors; semantic tokens cover the vast majority. If specific screens still look dark after the swap, those are quick follow-ups.

## Approval
Reply approve to proceed; I'll implement in one pass.