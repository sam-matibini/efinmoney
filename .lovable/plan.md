## Change

Replace the flat `bg-gradient-to-br from-background to-muted/30` wrapper on `ClaimPaymentLinkPage` (and the loading/error/claimed states) with a branded purple diagonal-stripes background so the "Link Claimed" screen no longer reads as plain black/white.

## Implementation

1. **`src/index.css`** — add a reusable utility:
   ```css
   .bg-stripes-purple {
     background-color: hsl(var(--brand-900));
     background-image: repeating-linear-gradient(
       135deg,
       hsl(var(--brand-700) / 0.55) 0 14px,
       hsl(var(--brand-900)) 14px 28px,
       hsl(var(--brand-500) / 0.35) 28px 42px,
       hsl(var(--brand-900)) 42px 56px
     );
   }
   ```
   Soft, on-brand purple stripes (uses existing `--brand-500/700/900` tokens, works in both light and dark mode).

2. **`src/pages/ClaimPaymentLinkPage.tsx`** — swap the four `min-h-screen ...` wrappers (loading, not-found, terminal-state, main claim form) to `min-h-screen ... bg-stripes-purple`. The white card in the middle stays white so the "Link Claimed" message sits on a card over the purple striped backdrop, matching the screenshot framing.

No other pages, no logic changes.
