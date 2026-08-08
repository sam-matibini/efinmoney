# Editable payout operator + contact form cleanup

## Goal
On the Add/Edit Payee form, let the mobile money operator (MTN, Airtel, Zamtel, M-Pesa, …) be chosen and saved per contact, and clean up the layout problems visible in the screenshot.

## 1. Payout operator picker
- When the default payout method is **Mobile**, show a "Mobile money operator" dropdown listing the operators available for the selected country (Zambia -> MTN MoMo, Airtel Money, Zamtel Kwacha; Kenya -> M-Pesa; etc.).
- Pre-select the contact's saved operator when editing; default to the country's first operator when adding.
- Save the choice on the contact so future sends prefill it. Clear it when the method is not Mobile.
- If a country has no mobile money operators, hide the dropdown and note that mobile money is unavailable for that country.

## 2. Form fixes
- **Duplicate phone fields**: merge "Phone" and "Phone (optional)" into a single phone field used both as the contact number and the mobile money payout number, with helper text when Mobile is selected. Existing contacts keep both stored values in sync on save.
- **Truncated country control**: let the country picker use the full row width and truncate gracefully so "Zambia · Mobile money" is readable instead of clipped mid-word.
- **Cramped two-column grids**: stack Nickname/Email, Phone/Address, and mailing city/region on narrow dialogs, keeping two columns only when there's room.
- **Section grouping**: group the fields under clear headings — Who (category, country, name, nickname), Contact (email, phone, address), Mailing address (optional, collapsible), Payout details (method + method-specific fields), Notes & tags.
- **Payout method tabs**: five tabs in one row overflow; switch to a wrapping/scrollable tab row so labels stay legible.

## Technical notes
- Form lives in `src/components/modals/AddBeneficiaryModal.tsx`; operator options come from `MM_COUNTRIES` in `src/lib/mobileMoneyNetworks.ts`, matched by the selected country's ISO code.
- The operator is stored in the existing `beneficiaries.network` column (already typed on `Beneficiary` in `src/hooks/useBeneficiaries.tsx`) — no migration needed.
- `ContactDetailsSheet` already reads payout fields; it will show the operator once saved.
- Single phone field writes to both `tel` and `phone` so nothing that reads either column breaks.
- Layout-only changes elsewhere; no backend or routing logic touched.
