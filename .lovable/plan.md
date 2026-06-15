## Change

Replace the heavy purple-stripes background on `ClaimPaymentLinkPage` with a soft, Plaid-style backdrop: near-white base with translucent flowing wave curves in teal/violet, similar to the reference image. Applies to all four states (loading, unavailable, claimed/expired, active claim).

## Implementation

1. **`src/index.css`** — replace the `.bg-stripes-purple` utility (added in the previous turn) with a new `.bg-payout-waves`:
   ```css
   .bg-payout-waves {
     background-color: hsl(0 0% 100%);
     background-image:
       radial-gradient(ellipse 70% 50% at 18% 12%, hsl(170 80% 70% / 0.18), transparent 65%),
       radial-gradient(ellipse 60% 45% at 82% 8%, hsl(258 85% 75% / 0.20), transparent 70%),
       radial-gradient(ellipse 90% 60% at 50% 100%, hsl(220 90% 80% / 0.15), transparent 70%),
       repeating-radial-gradient(
         circle at 50% -20%,
         hsl(220 70% 75% / 0.07) 0 2px,
         transparent 2px 22px
       );
   }
   .dark .bg-payout-waves {
     background-color: hsl(var(--background));
     background-image:
       radial-gradient(ellipse 70% 50% at 18% 12%, hsl(170 80% 50% / 0.22), transparent 65%),
       radial-gradient(ellipse 60% 45% at 82% 8%, hsl(258 85% 60% / 0.25), transparent 70%),
       radial-gradient(ellipse 90% 60% at 50% 100%, hsl(220 90% 60% / 0.18), transparent 70%),
       repeating-radial-gradient(
         circle at 50% -20%,
         hsl(220 70% 70% / 0.08) 0 2px,
         transparent 2px 22px
       );
   }
   ```
   The repeating-radial-gradient creates the thin concentric "wave lines" arcing from the top, layered over soft teal/violet/blue glows — mirroring the Plaid hero look.

2. **`src/pages/ClaimPaymentLinkPage.tsx`** — swap the four `bg-stripes-purple` wrappers to `bg-payout-waves`. No structural changes; the white claim card stays as the focal element on the soft wave backdrop.

No edge function / data changes.
