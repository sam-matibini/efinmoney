## Goal
Redesign the Cards page to match a Shakepay-style experience: a clean branded card face that **flips on tap** to reveal the sensitive details (number, expiry, CVV), plus a row of compact action icons (**Lock card**, **Card details**, **Settings**) under each card.

## Scope
Frontend-only changes to the existing Cards page and a new card component. No DB or API changes — we keep using the current `useCards` hook, `funding_source`, `card_number`, `cvv`, `expiry_month/year` fields already in place.

## What changes

### 1. New component `src/components/cards/FlipCard.tsx`
- Two faces wrapped in a 3D flip container (Tailwind + inline `transform-style: preserve-3d` / `backface-visibility: hidden`, animated via framer-motion `rotateY`).
- **Front face** — Shakepay-inspired:
  - Brand wordmark "efinMoney" top-left
  - Large centered logo/mascot (use existing app icon or a simple monogram glyph — no new asset generation)
  - Network mark bottom-right ("VISA" / "Mastercard" wordmark)
  - Solid brand-color background (use `--primary` token; alternate accent color for second card via existing gradient utility)
  - Frozen / Cancelled overlay badge preserved
- **Back face**:
  - Magnetic stripe bar
  - Cardholder name
  - Card number (formatted in groups of 4) with copy button
  - Expiry (MM/YY) and CVV with copy buttons
  - Spending limit line
  - Small "Tap to flip back" hint
- Click anywhere on the card toggles flip. Action buttons below do **not** trigger a flip (stop propagation).
- For `funding_source === 'external'` cards (no stored PAN/CVV): back face shows only `•••• last_four`, expiry, and a note "Full details not stored — used for funding only."

### 2. `src/pages/CardsPage.tsx`
- Replace the current inline card markup with `<FlipCard card={...} />`.
- Replace the current 3-button row (Freeze / Settings / Delete) with a Shakepay-style **icon button row**:
  - **Lock card** (lock/unlock icon) → toggles freeze
  - **Card details** (credit-card icon) → flips the card to the back
  - **Settings** (gear icon) → opens `EditCardModal`
  - For external cards, replace "Lock card" with **Fund Wallet** (keeps existing funding flow)
- Each icon sits in a rounded white/surface tile with a label underneath, matching the reference image.
- Keep the dropdown menu (with Delete, Request Physical, etc.) accessible from the Settings icon's secondary menu, so no functionality is lost.
- Remove the now-redundant reveal-eye and copy-corner buttons on the front face (they live on the back face instead).

### 3. Styling
- Use existing semantic tokens (`bg-primary`, `text-primary-foreground`, `bg-card`, `border`, etc.) — no hard-coded colors.
- Add a small utility in `src/index.css` for `perspective` and `backface-hidden` if not already present.
- Maintain dark-mode contrast and current responsive grid (`md:grid-cols-2`).

## Out of scope
- Custom card-art uploads, multiple themes per card, NFC/Apple Pay flows.
- Generating a new mascot illustration (we'll use a simple monogram "e" glyph; we can swap to a generated mascot later if requested).
- Any change to card issuance, Plaid funding, or backend logic.

## Files touched
- **new**: `src/components/cards/FlipCard.tsx`
- **edit**: `src/pages/CardsPage.tsx`
- **edit (small)**: `src/index.css` (perspective utilities, only if needed)
