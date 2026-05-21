## Update card brand label to "eFinVISA"

Keep the underlying card type as Visa (Stripe `brand: "visa"` unchanged) but display the brand lockup as **eFinVISA** (capital VISA) wherever it shows on the card UI.

### Change
- `src/components/cards/VirtualCardVisual.tsx`
  - Bottom-right brand line: `eFinVisa` → `eFinVISA`
  - Default nickname fallback: `eFinVisa` → `eFinVISA`
- `src/pages/EfinCardDetailPage.tsx`
  - H1 fallback: `eFinVisa` → `eFinVISA`
- `src/components/cards/IssueVirtualCardModal.tsx`
  - Dialog title / button: `eFinVisa` → `eFinVISA`
- `src/components/cards/EfinCardsSection.tsx`
  - Section title text: `eFinVisa` → `eFinVISA`

### Out of scope
- No change to Stripe `brand` field, DB schema, routes, or file names.
- No change to tap-to-pay behavior.
