# "Same as address" checkbox for mailing address

## Goal
On the Add/Edit Payee form, add a checkbox under the Mailing address heading: "Same as address". When checked, the mailing street field mirrors the contact Address and the mailing fields are not typed twice.

## Behaviour
- Checkbox label: "Same as address", placed right after the "Mailing address (optional)" heading.
- When checked:
  - The mailing street input is hidden (or shown disabled with the Address value) and the city / state / postal inputs stay editable, since the contact Address is a single free-text line.
  - On save, `mailing_address` is set to the contact Address value.
  - Typing in Address keeps the mirrored mailing value in sync while checked.
- When unchecked: mailing street becomes editable again and keeps whatever was last typed.
- When editing an existing contact, the box starts checked if the saved mailing address already equals the saved address (and both are non-empty).

## Technical notes
- All changes in `src/components/modals/AddBeneficiaryModal.tsx`.
- New `sameAsAddress` state, initialised in the existing reset/prefill effect by comparing `editing.mailing_address` with `editing.address` (trimmed, case-insensitive).
- In the save payload, use `sameAsAddress ? address.trim() || null : mailingAddress.trim() || null` for `mailing_address`; city/region/postal unchanged.
- Use the existing shadcn `Checkbox` component with a `Label` for the toggle, matching current form styling. No schema or backend changes.
