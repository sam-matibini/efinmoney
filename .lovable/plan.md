## Fix: Top-up form disappears when clicking Amount field

### Suspected cause

In `src/components/modals/TopUpModal.tsx`, the modal uses Radix `Dialog`. When the Amount input in `CardPaymentForm` is focused, focus moves out of the Dialog into a re-rendered subtree (the Stripe `<Elements>` wrapper re-mounts on theme/wallets changes), which can cause Radix to perceive a focus-loss/outside-interaction and close the dialog.

Specific issues found while reading the code:
- `TopUpModal` always passes `wallets?.find(...)` recomputed each render, but `CardPaymentForm` is mounted unconditionally inside the dialog body — fine.
- `CardPaymentForm` default export computes `elementsOptions` with `useMemo(..., [])` ✔, but its theme color is captured at first render only — not the bug.
- `InnerForm.useMemo(() => buildElementOptions(), [])` reads CSS variables that are not yet available at first render in some cases — minor.
- The likely real culprit: the outer Dialog has `max-h-[85vh] flex flex-col` and the body is `overflow-y-auto`. On `type="number"` focus, the browser scrolls the field into view, causing layout shift; combined with Stripe Elements iframe focus, Radix Dialog (`onInteractOutside`/focus trap) sometimes triggers `onOpenChange(false)` because the iframe is treated as outside content.

### Plan

1. Use the browser tool to reproduce on the live preview at `/wallets/.../statement` → click Top up → click Amount input, and confirm the dialog closes.
2. Apply the fix to `src/components/modals/TopUpModal.tsx`:
   - Add `onInteractOutside={(e) => e.preventDefault()}` and `onPointerDownOutside={(e) => e.preventDefault()}` to `DialogContent` so clicks/focus moving into Stripe iframes don't dismiss the modal.
   - Keep the X button and Escape key as the only ways to close it.
3. In `CardPaymentForm`, make the Amount `Input` use `type="text"` with `inputMode="decimal"` and a numeric pattern instead of `type="number"` to prevent native spinner focus shifts and weird scroll behavior.
4. Re-test with the browser: open Top up, click Amount, type a value, confirm the form stays open and the Pay button enables once card details are filled (with a Stripe test card).

### Files touched
- `src/components/modals/TopUpModal.tsx` — add Dialog interaction guards.
- `src/components/modals/CardPaymentForm.tsx` — switch amount input type.

### Verification
- Browser: open modal, click Amount, type "10", form remains visible.
- Browser: click into the Stripe card-number iframe; modal does not close.
- Browser: press Escape — modal closes (expected).
