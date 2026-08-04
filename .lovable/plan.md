# Colored nav cells in the top bar

Right now each top-bar item only has a colored icon; the cell itself is neutral grey/white. This change gives every menu item (Dashboard, Send, Top up, Contacts, Exchange, Wallets, Cards, and the role items) its own medium-bold colour that fills the whole cell.

## What changes

- Each nav item gets a soft tinted background in its own hue, a matching thin border, and a label in that same colour at medium-bold weight — so the whole cell reads as coloured, not just the icon.
- Hover deepens the tint slightly; the active item gets the strongest tint, a coloured ring and a soft coloured glow so it still stands out clearly against its neighbours.
- Colours stay in the existing family already used for the icons (Dashboard indigo/primary, Send sky, Top up emerald, Contacts cyan, Exchange indigo, Wallets teal, Cards blue, Payments violet, Admin rose) so nothing clashes with the brand.
- Mobile menu rows use the same per-item colour for consistency.
- Both light and dark mode tuned for readable contrast (AA on label text).

## Technical notes

- Add a `navCellTones` map in `src/components/layout/headerStyles.ts` with `{ idle, hover, active, label }` token classes per nav label, plus a `navCellTone(label)` helper with a neutral fallback.
- Apply the tone in `src/components/layout/HeaderNavItem.tsx`: tinted background on the cell wrapper, tone-coloured active pill (replacing the plain `bg-background` pill) and tone-coloured label with `font-semibold`.
- Apply the same tone in the mobile list (`navMobileClass` / `MobileNav.tsx`).
- Colours defined as semantic tint tokens in `src/index.css` + `tailwind.config.ts` rather than raw hex in components, following the existing avatar-colour token pattern.
- No routing, data, or behaviour changes — presentation only.
