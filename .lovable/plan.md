# Fix payee saving + prefill contact country into the address

## 1. The "address column in the schema cache" error (root cause verified)

The `beneficiaries` table does have every address column (`address`, `address_city`, `address_region`, `address_postal_code`, `address_country_code`, `tel`, and the five `mailing_*` columns).

The problem is permissions, not the columns: a query of the grants catalog for `public.beneficiaries` returns **zero rows** — no role has any Data-API privilege on the table. Without grants the API can't resolve the table's columns and reports the misleading "Could not find the 'address' column of 'beneficiaries' in the schema cache". An earlier attempt at these grants did not end up applied, which is why the error persists.

Fix — one migration on `public.beneficiaries`:
- Signed-in users may read, add, edit and delete rows (the existing row-level rules already limit each user to their own contacts).
- Backend/admin code gets full access.
- No access for anonymous visitors — contacts are private.
- Refresh the API schema afterwards.

Then verify by saving a payee with a full address from the form.

## 2. Prefill the address country from the contact country

Today the contact country (top of the form, e.g. Kenya) and the Address country select are independent, so the address block opens on an unrelated country (Ghana in the screenshot) and has to be re-picked.

New behaviour:
- On a new contact, the Address country follows the contact country automatically, and keeps following it if the contact country is changed while the address country hasn't been touched manually.
- Once the user picks an Address country themselves, their choice sticks and is no longer overwritten.
- When editing an existing contact, the saved `address_country_code` is respected and never overwritten.
- "Same as address" keeps mirroring the country into the mailing block as it does now.

## Technical notes

Migration:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT ALL ON public.beneficiaries TO service_role;
NOTIFY pgrst, 'reload schema';
```
No schema change, no data change, RLS policies untouched.

Frontend, only `src/components/modals/AddBeneficiaryModal.tsx`:
- Map the selected contact country to ISO-2 with `COUNTRY_ISO2` from `src/lib/countryIso.ts` (the country picker's `code` is a currency, not ISO).
- Add an `addressCountryTouched` flag set by the Address country `onValueChange`; reset it in the existing open/prefill effect.
- Effect: when `!addressCountryTouched && !editing`, set `addressCountry` to the ISO-2 of `country`.
- Save payload and mirroring logic unchanged.
