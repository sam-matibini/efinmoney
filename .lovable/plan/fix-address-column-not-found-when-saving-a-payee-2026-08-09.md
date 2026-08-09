# Fix "address column not found" when saving a payee

## Root cause (verified)
- The `beneficiaries` table does have every address column: `address`, `address_city`, `address_region`, `address_postal_code`, `address_country_code`, and the five `mailing_*` columns.
- However, the table has **no Data-API grants at all** — querying the grants catalog returns zero rows for `beneficiaries`. A direct API insert returns `permission denied for table beneficiaries`.
- Without grants, the API layer can't build a complete picture of the table, so it rejects the payload with the misleading "Could not find the 'address' column of 'beneficiaries' in the schema cache" message. Earlier schema-cache reloads didn't help because the cache was never the problem.

## Fix
One migration on `public.beneficiaries`:
- Allow signed-in users to read, add, edit and delete rows (the existing row-level rules already limit each user to their own contacts).
- Allow backend/admin code full access.
- No access for anonymous visitors — contacts are private.
- Refresh the API schema afterwards.

Then verify by adding a payee with a full address plus mailing address from the form.

## Technical notes
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT ALL ON public.beneficiaries TO service_role;
NOTIFY pgrst, 'reload schema';
```
- No schema change, no data change, RLS policies untouched.
- No frontend changes needed — `AddBeneficiaryModal.tsx` already sends all address parts and the mirroring for "Same as address" is correct.
