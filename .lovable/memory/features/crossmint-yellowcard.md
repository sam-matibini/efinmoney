---
name: Crossmint + Yellow Card African Send
description: Card-funded USD/CAD → USDC (Stellar) → NGN bank deposit flow. Crossmint headless checkout creates USDC; webhook triggers Yellow Card payout. Page at /send/african-card.
type: feature
---
**Stack:**
- Table: `crossmint_yellowcard_transfers` (realtime enabled). States: pending → card_charged → usdc_received → payout_sent → success / failed / pending_payout.
- Edge fns: `crossmint-create-order` (auth required), `crossmint-webhook` (public, triggers `yellowcard-payout` when usdc_received), `yellowcard-payout` (service-role), `yellowcard-webhook` (public).
- Frontend: `src/pages/AfricanCardSendPage.tsx` at `/send/african-card` (KYC-protected).

**Secrets required:**
- `CROSSMINT_API_KEY`, `CROSSMINT_PROJECT_ID`, `CROSSMINT_WEBHOOK_SECRET`, `CROSSMINT_ENV` (staging/production) — configured.
- `YELLOWCARD_API_KEY`, `YELLOWCARD_SECRET`, `YELLOWCARD_ENV` — NOT YET CONFIGURED. Until added, payout edge fn marks transfer `pending_payout` and admin must settle manually.

**Webhook URLs (paste in provider consoles):**
- Crossmint: `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/crossmint-webhook`
- Yellow Card: `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/yellowcard-webhook`

**Corridor:** Nigeria (NGN) only at launch; will expand as Yellow Card adds corridors.
**Decision:** Replace all African payouts per user — existing PawaPay/Flutterwave still installed but new corridor entries should route here.

**Open follow-up:** Wire /send African country selector to redirect to /send/african-card (not yet done — page is reachable by direct URL).
