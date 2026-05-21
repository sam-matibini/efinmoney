# Redesign card visual to match uploaded mockup

Update `src/components/cards/VirtualCardVisual.tsx` so the rendered card matches the reference image (blue gradient eFinMoney VISA card). No backend, schema, or `brand` field changes — `brand: "visa"` stays as-is.

## Visual changes

- **Background**: replace current emerald gradient with a deep blue gradient (slate-900 → blue-900 → blue-700) and add a diagonal light "shine" band overlay similar to the mockup.
- **Top-left**: keep "efinMoney" wordmark (lowercase `efin` + bold `Money`) as the brand lockup — drop the small "eFinVISA" nickname line from the top.
- **Top-right**: keep the contactless `Wifi` icon (rotated, no background pill). Move the status badge out of the top row (or hide it on the front face) so it doesn't clash with the mockup.
- **Chip**: add a small gold/amber rounded rectangle chip under the wordmark.
- **Card number row**: render as three dot groups + last4, e.g. `•••• •••• •••• 9220`, with wider tracking and larger font.
- **Bottom-left**: `CARDHOLDER` label + cardholder name (uppercase). Requires passing the holder name in — add an optional `cardholderName?: string` prop; fall back to `nickname` or blank.
- **Bottom-center**: `EXPIRES` label + `MM/YY`.
- **Bottom-right**: replace the current "eFinVISA" mono text with a stylized **VISA** wordmark (italic, bold, white) — the brand mark, not the product name. Remove the `CreditCard` lucide icon.

## Props

- Add `cardholderName?: string` to `VirtualCardVisualProps`.
- Update call sites (`EfinCardDetailPage.tsx`, `EfinCardsSection.tsx`, `IssueVirtualCardModal.tsx` preview) to pass the profile's full name when available. No behavior change if absent.

## Out of scope

- Stripe `brand` field, DB schema, routes, tap-to-pay logic.
- "eFinVISA" text elsewhere in the UI (section titles, modal titles) stays as previously set.
