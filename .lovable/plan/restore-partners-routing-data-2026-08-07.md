# Restore Partners & Routing Data

## Confirmed cause

- `payment_partners` contains **13 existing partners**.
- Its pricing-manager row-level policy exists and checks authenticated admin/finance access.
- The database catalog currently shows **no table grants** for `authenticated` or `service_role` on `payment_partners` or the related pricing/routing tables.
- Without those grants, the browser cannot reach the row-level policy. The published UI is also still using the older empty-state behavior, so the permission failure appears as “No partners yet.”

## Fix

1. Apply one backend migration that explicitly grants each of the 18 pricing/routing tables only the operations already permitted by its existing policies:
   - authenticated pricing managers receive the required read/write table privileges;
   - backend functions receive full table privileges;
   - anonymous users receive no access.
2. Keep all existing rows and row-level policies unchanged—no partners or corridors will be recreated.
3. Verify the grants directly from the database catalog and confirm the partner count remains 13.
4. Verify Admin → Pricing as the signed-in admin: Partners must show 13 records and Corridors must load its existing records.
5. Retain the current frontend error state with Retry so a future permission failure is displayed as an error rather than a false empty result, then publish that frontend revision.

## Technical scope

- Explicitly enumerate only the 18 partner pricing/routing tables; do not grant across the full public schema.
- Do not weaken row-level security or add anonymous policies.
- Validate both the backend response and the rendered admin page before calling the issue fixed.