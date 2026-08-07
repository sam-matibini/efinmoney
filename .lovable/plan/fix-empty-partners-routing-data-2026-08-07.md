# Fix Empty Partners & Routing Data

## Confirmed diagnosis

- The database contains **13 payment partners**.
- `payment_partners` and the other 17 pricing/routing tables currently have **no grants** for the authenticated browser role.
- Existing row-level policies already restrict access through `is_pricing_manager(auth.uid())` (with the relevant admin exceptions on certain tables).
- The Partners panel does not render the query error, so a permission failure incorrectly appears as “No partners yet.”

## Fix

1. Apply one backend migration granting the operations already allowed by each table’s existing policies:
   - `authenticated`: table-specific `SELECT`, `INSERT`, `UPDATE`, and `DELETE` access, limited by the existing row-level policies.
   - `service_role`: `ALL` for backend functions.
   - No anonymous access.
2. Update the partner query UI to distinguish a real empty result from a loading or permission error, with a visible error message and retry action.
3. Verify the grants from the database catalog, then open Admin → Pricing as the authenticated admin and confirm the 13 partners render.
4. Check another pricing tab (Corridors) to confirm the shared permission issue is resolved across the engine.

## Technical notes

- No partner rows will be recreated or duplicated.
- Existing row-level policies remain unchanged; the migration only restores the Data API privileges required for those policies to be reached.
- The migration will explicitly enumerate the 18 pricing/routing tables rather than grant access across the entire public schema.