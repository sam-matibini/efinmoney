# Fix: Interac shows "temporarily unavailable" even though it is live

## What's actually wrong

The Interac checkout asks the backend "is Interac configured?" before showing the payer form. That request is sent with an API key read from an environment variable that does not exist in this project (`VITE_SUPABASE_ANON_KEY`), while the real variable is `VITE_SUPABASE_PUBLISHABLE_KEY`. The key goes out empty, the request is rejected before it reaches the function, and the UI concludes Interac is unavailable.

Confirmed:
- The project env only defines `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`.
- The backend reports availability from the deposit alias, and the `WISE_CAD_INTERAC_ALIAS` secret is set, so the rail itself is configured.
- An unauthenticated call to the function returns "Missing authorization header", which is exactly the rejection the bad key produces.

The same wrong variable is used in three more places, so the status polling and the CAD top-up panel are broken in the same way.

## What to change

1. Stop hand-rolling these calls. Route the Interac bootstrap and the status polling through the Supabase client's function invocation, which attaches the session token and the correct key automatically:
   - `src/components/payments/InteracCheckout.tsx` — the availability/bootstrap call and the polling call.
   - `src/components/topup/CadCollectionPanel.tsx` — same bootstrap call.
   - `src/components/payments/WiseTopUpCard.tsx` — same pattern.
2. Keep the availability gate, but only block when the backend explicitly reports no deposit alias. A network or auth failure should surface a retry, not a permanent "unavailable" message — that behaviour is what hid this bug.
3. Verify end to end: open the send flow, confirm the payer form renders with the deposit alias and reference, and confirm the waiting/status view still polls and updates.

## Technical notes

- The GET branch of `fincra-cad-interac` already returns `{ alias, configured, pending }`; the client contract does not change.
- Invoking with query state: the polling call currently passes `intent_id` as a query string. Move it to a `GET` invocation with the same query parameter (supported) so no backend change is needed.
- No database or edge function changes required.
