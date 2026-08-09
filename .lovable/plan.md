# Fix "address column not found" on Add/Edit Payee

## What's happening
The `beneficiaries` table already has `address`, `tel`, `mailing_address`, `mailing_city`, `mailing_region` and `mailing_postal_code` columns (confirmed by querying the database). The save fails with "Could not find the 'address' column of 'beneficiaries' in the schema cache" because the API layer's cached schema is stale, so it rejects the payload before it reaches the table.

## Fix
1. Run a small migration that refreshes the API schema cache so the newer columns become visible to the app again.
2. Verify by saving a payee with an address from the form.

## Mailing-address prefill polish
When "Same as address" is checked, the mailing street box currently looks empty/greyed because the mirrored value sits in a disabled input. Change it to a read-only (not disabled) input so the copied address renders as real filled text, and keep it updating live as the Address field is typed.

## Technical notes
- Migration content: `NOTIFY pgrst, 'reload schema';` (no schema change, no data change).
- UI change limited to `src/components/modals/AddBeneficiaryModal.tsx`: swap `disabled` for `readOnly` on the mailing street input and keep the existing `sameAsAddress ? address : mailingAddress` value binding plus the save payload as-is.
