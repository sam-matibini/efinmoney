# Match the Address and Mailing address fields

## Goal
Give the contact Address the same structure as the Mailing address — street, city/town, state/province, country, postal/ZIP — so "Same as address" can copy every part instead of just the street line.

## What changes on the form
Both blocks get identical field sets, in the same order:

```text
Address                          Mailing address (optional)  [x] Same as address
  Street address                   Street address
  City / Town                      City / Town
  State / Province                 State / Province
  Country                          Country
  Postal / ZIP code                Postal / ZIP code
```

- Only the street line is required (as today); the rest are optional.
- When "Same as address" is checked, all five mailing fields mirror the address fields live as they are typed, shown read-only (real text, not greyed placeholders).
- Unchecking restores whatever was last typed in the mailing fields.
- When editing an existing contact, the box starts checked only if every saved mailing part matches the corresponding address part.
- Country uses the same picker/select style already used in the form; it defaults to the contact's selected country on new contacts.

## Database
The contact side currently stores only a single free-text `address`. Add the missing parts, plus a country for the mailing block:

- `address_city`, `address_region`, `address_postal_code`, `address_country_code`
- `mailing_country_code`

All nullable text, no data migration needed; existing `address` values stay as the street line.

## Technical notes
- Migration adds the five columns to `public.beneficiaries` (nullable text). Existing grants and RLS unchanged.
- `src/components/modals/AddBeneficiaryModal.tsx`: new state for the address parts, prefill from the new columns, mirror logic keyed off `sameAsAddress` for all five values, save payload writes both sets.
- `src/components/contacts/ContactDetailsSheet.tsx` shows the composed address lines for both blocks.
- No payout, routing, or backend logic touched.
