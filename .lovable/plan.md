# Align each checkout method with its own checkout procedure (Send flow)

Today the Amount step of Send Money shows the same wallet dropdown no matter which method is picked. With **Card** selected it renders a "Credit to wallet" selector showing a CAD balance — which reads like the money is being added to a wallet rather than paying for the transfer. Bank shows an account picker, Wallet shows a balance picker, and there are no card details anywhere until the user is bounced to a hosted page at the Confirm step.

## What changes

Right below the coloured Card / Bank / Wallet row, render a **method-specific checkout panel**. Only the panel for the selected method appears.

**Card**
- Saved cards list (if the user has any) with a "Use a new card" option.
- New-card fields: Cardholder full name, Card number (formatted, brand auto-detected), Expiry MM/YY, CVV — the same field set already used elsewhere in the app for card top-ups.
- A small line explaining what will be charged: amount + fee = total, in the charge currency.
- Where the corridor's card rail only supports a hosted checkout page (some partners do not allow us to collect card data directly), the panel says so plainly and shows a "You'll enter card details on the secure payment page" note instead of dead input boxes — no fake fields.
- The confusing "Credit to wallet" dropdown is relabelled and moved inside this panel as "Charge in" (the currency the card is billed in), with helper text.

**Bank**
- Keeps the linked-account picker and the "Link bank account" empty state, now inside the panel with the 1-2 business day note attached to the method rather than floating.

**Wallet**
- Wallet picker with balance, plus an inline "total to be debited" line and the low-balance / top-up prompt.

## Errors fixed from the screenshot
- Card no longer shows "Credit to wallet" + a wallet balance row, which implied a top-up.
- The selected method's requirements are validated before "Continue" is enabled (card fields complete and valid, bank account chosen, wallet balance covers amount + fee).
- Fee line stays as-is: `+C$1.80 CAD fee added · total C$3.80 CAD` (already correct).

## Technical notes
- New `src/components/send/MethodCheckoutPanel.tsx` holding the three panels; card fields extracted from the existing `FlutterwaveCardForm` field/validation helpers so formatting, brand detection and validation stay identical.
- `SendPage.tsx`: replace the inline wallet/bank blocks (around the `PaymentMethodRow`) with the panel; extend the step-1 validity check with per-method requirements.
- Card charge submission continues to use the existing provider selection (`cardSendRails`); direct-charge rails receive the collected card payload, hosted rails keep the redirect.
- No backend, pricing, or ledger changes.
