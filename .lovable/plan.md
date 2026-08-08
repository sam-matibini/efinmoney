# Single card capture in the Send flow

Card details are asked for twice today: step 1 shows a "Card checkout" panel (saved cards + quick add, with the note "you'll enter your card number on the next step"), and then the Confirm step renders a second, full card form with its own "Amount (CAD)" box, eFinMoney checkout header and Pay button.

## What changes

- Card fields (cardholder name, card number, expiry, CVC, optional billing street / city / ZIP) move **into the step-1 card checkout panel**, entered once, below the existing charge summary and saved-card list.
- The panel keeps the current formatting, brand detection and validation behaviour from the existing card form. The duplicated "Amount (CAD)" input is dropped — the amount already comes from the send form.
- Continue on step 1 is enabled only when the card entry is complete and valid (or a saved card is selected).
- The Confirm step no longer renders a card form. It shows the quote, a masked line such as "Visa •••• 3701 · exp 02/31", and one "Pay C$x.xx & send" button, plus Back and Cancel Transfer as today.
- Any bank challenge (PIN / OTP / 3-D Secure / AVS) still appears at Confirm after the Pay press, since it only comes back from the provider.
- Hosted-redirect card rails (where `inlineEntry` is false) are unchanged: the panel keeps its "details are entered on the secure page" note and Confirm keeps the redirect button.

## Technical notes

- `src/components/send/MethodCheckoutPanel.tsx` — render the card fields when `inlineEntry` is true; card values and validity come in as props from the parent.
- `src/pages/SendPage.tsx` — hold the card form state, remove the `FlutterwaveCardForm` block at step 3, pass the collected card payload into the existing charge call, render the masked-card summary, and extend the step-1 continue gate.
- `src/components/payments/FlutterwaveCardForm.tsx` — extract the field/validation/challenge helpers for reuse; the component itself stays for the Top-up page and modals.

No backend, function or schema changes.
