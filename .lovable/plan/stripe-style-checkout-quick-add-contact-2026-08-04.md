# Stripe-style checkout + quick Add contact

Two changes, both frontend/presentation only. No pricing, ledger, or gateway logic changes.

## 1. Lovable/Stripe-style checkout layout

Today the top-up "Pay" step and the send review step render as a plain stacked card. The reference screenshot is a two-panel checkout: a dark summary rail on the left (brand, big total, line items, subtotal, tax/fee, total due) and a light payment pane on the right (contact email, a radio list of payment methods, one full-width Pay button, small trust footer).

New shared component `src/components/money/CheckoutShell.tsx`:
- Left rail: eFinMoney mark, "Pay <merchant/recipient>", large amount, then line items (description + qty/rate style rows), divider, subtotal, fee/FX row with an info tooltip, divider, Total due.
- Right pane: optional express row for one-tap methods that already exist, "OR" divider, Contact information block showing the signed-in email, "Payment method" radio list, primary Pay button, "Powered by <gateway>" footer line.
- Responsive: stacks to summary-on-top on mobile.
- All colors from existing semantic tokens (`card`, `muted`, `primary`, `foreground`), so it themes correctly in light and dark. No hardcoded black/white/purple.

New `src/components/money/CheckoutMethodList.tsx`: radio rows with icon, label, and an expandable body so the currently selected gateway card (Flutterwave, Nomba, Paytota, Dodo, Swychr, Interac, Wise, Adyen) renders inside its own row instead of stacking every card at once.

Wiring:
- `src/pages/TopUpPage.tsx` step 2: replace the stacked `SectionBoundary` list with `CheckoutShell` + `CheckoutMethodList`; summary shows amount, min/fee note, CAD-via-USD quote rows where applicable. Existing gateway components are reused untouched.
- `src/pages/SendPage.tsx` confirm step and `src/components/send/CanadaSendFlow.tsx` review step: render the same left summary rail (send amount, fee, FX rate, recipient gets, total to pay) with the existing confirm button as the Pay action.

## 2. Quick "Add contact" in the transfer flow

Reference is the Interac form: `To — Select contact` dropdown with an "Add contact >" link directly under it.

New `src/components/send/ContactQuickField.tsx`:
- Label "To", a select/typeahead over saved beneficiaries (reuses `useBeneficiaries` and the existing `PayeePicker` filtering logic), showing name plus email/phone.
- Right-aligned "Add contact >" link under the field, opening the existing `AddBeneficiaryModal`.
- On save, the new contact is selected automatically and its details fill the recipient fields.
- Selected state shows a compact chip with a clear (X) button.

Wiring:
- `src/pages/SendPage.tsx` recipient step: `ContactQuickField` becomes the first element; the existing "Choose from saved contacts" button is kept as a secondary "Browse all" link.
- `src/components/send/CanadaSendFlow.tsx`: swap the current saved-contacts block for `ContactQuickField` (keeping "Browse all contacts" and the Canada filter).

## Technical notes

- No schema, edge function, or hook changes; `useBeneficiaries`, `AddBeneficiaryModal`, and `ContactsPickerModal` are reused as-is.
- `MoneyFlowShell` stays the wrapper for the amount/recipient steps; `CheckoutShell` only replaces the final pay/confirm surface.
- Verify with a typecheck and a Playwright pass over `/wallet/topup` and `/send` in light and dark themes.
