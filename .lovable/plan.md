Remove the duplicate "Charge in" currency selector from the card checkout panel.

The card checkout currently shows a "Charge in" wallet/currency dropdown that duplicates the "You send" currency on the main send form. The task is to remove that dropdown while keeping the charge summary and card details intact.

## Scope
- `src/components/send/MethodCheckoutPanel.tsx` — remove the `walletSelect("Charge in", ...)` render inside the card method block.

## Out of scope
- No changes to the wallet/bank method checkout flows.
- No changes to the "You send" currency field or FX calculations.
- No changes to the `ChargeSummary`, card details, or quick-add card row.

## Verification
- Build and type-check the project after the change.
- Open the Send flow, select a card payment method, and confirm the "Charge in" dropdown is gone but the card details, fee summary, and total remain visible.
