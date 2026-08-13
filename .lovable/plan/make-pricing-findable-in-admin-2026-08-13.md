# Make pricing findable in Admin

Pricing already exists at `/admin/pricing` (two tabs: Rate card, Partners & Routing). It is hard to find because the admin sidebar group is called "Payments" and the two links are labelled "Corridor rails" and "Rate card".

## Change

Rename the admin sidebar group "Payments" to "Partners & Pricing". Nothing else changes: the same items stay in the group, links and routes are untouched.

## Technical note

Single label edit in the `NAV_GROUPS` "Payments" entry in `src/components/admin-portal/AdminLayout.tsx`.
