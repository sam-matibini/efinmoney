## Goal

Polish the dashboard with three motion upgrades:

1. Wallet cards stagger in from below with a spring on page load.
2. Hovering a wallet card scales it to 1.02 and casts a colored glow matching the card's gradient.
3. The "Total Portfolio Value" headline counts up smoothly using `react-countup`.

## Scope

- `src/components/dashboard/WalletCarousel.tsx` — the wallet cards rendered under the hero on `/` (Index).
- `src/components/dashboard/HeroBalance.tsx` — the big "Total Portfolio Value" number.
- Add dependency: `react-countup`.

The standalone `WalletCard` component (used on `/wallets`) is out of scope — the user said "the Wallet cards on the dashboard", which is the carousel.

## Changes

### 1. Stagger-in animation (WalletCarousel)

Wrap the mapped cards in a `motion` parent with `variants` + `staggerChildren`, and convert `TiltCard`'s entry animation to use a child variant with a spring:

```ts
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1, y: 0,
    transition: { type: "spring", stiffness: 260, damping: 22, mass: 0.9 },
  },
};
```

Apply `initial="hidden" animate="show" variants={container}` to the scroll container and `variants={item}` on each `TiltCard`. The existing active-card scale and tilt behavior stays.

### 2. Hover scale + colored glow (WalletCarousel `TiltCard`)

- Add `whileHover={{ scale: 1.02 }}` with a short spring transition.
- Derive a glow color from the card's gradient (parse the first hex in the `gradient` string, fall back to `#6366f1`) and animate `boxShadow` on hover:

```ts
whileHover={{
  scale: 1.02,
  boxShadow: `0 18px 50px -10px ${glowColor}88, 0 0 24px ${glowColor}55`,
}}
```

Keep the existing `shadow-xl` class as the resting shadow; framer-motion's inline `boxShadow` will take over on hover and revert on leave.

### 3. react-countup for Total Portfolio Value

- `bun add react-countup`.
- In `HeroBalance.tsx`, replace the inline `AnimatedBalance` with `CountUp`:

```tsx
<CountUp
  end={totalUsd}
  duration={1.6}
  decimals={2}
  separator=","
  prefix="$"
  preserveValue
/>
```

`preserveValue` prevents resetting to 0 on re-renders (e.g., when wallets refetch); it will smoothly tween from the previous value to the new one. The hidden-balance toggle and surrounding layout are unchanged.

## Out of scope

- The standalone `WalletCard` component on `/wallets`.
- Per-wallet AnimatedNumber balances (already animate nicely).
- Any data, routing, or business logic changes.
