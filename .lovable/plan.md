## Rename to eFinVisa + enable Tap to Pay

### 1. Rebrand "EfinCards" → "eFinVisa" (UI strings only, file/route names unchanged)
- `src/components/cards/EfinCardsSection.tsx`
  - Section title: `EfinCards · Virtual Cards` → `eFinVisa · Virtual Visa Cards`
  - Subtitle: emphasize Visa + contactless ("Instant Visa cards. Spend online or tap to pay with Apple/Google Pay.")
- `src/components/cards/IssueVirtualCardModal.tsx`
  - Dialog title: `Issue Virtual Card` → `Issue eFinVisa Card`
  - Button: `Create Card` → `Create eFinVisa`
- `src/components/cards/VirtualCardVisual.tsx`
  - Default nickname fallback: `Virtual Card` → `eFinVisa`
  - Brand line bottom-right: show `eFinVisa` lockup beside the Visa mark
- `src/pages/EfinCardDetailPage.tsx`
  - H1 fallback: `Virtual Card` → `eFinVisa`

### 2. Enable Tap to Pay (Apple/Google Pay tokenization)

Stripe Issuing virtual cards become "tap to pay" via mobile wallet provisioning. We add the capability flag end-to-end and a provisioning entry point.

**Issuance modal** (`IssueVirtualCardModal.tsx`)
- Add a `Tap to pay` Switch (default ON) with helper text: "Add to Apple Pay / Google Pay for in-store contactless".
- Pass `tap_to_pay: true` in the createCard payload.

**Hook** (`src/hooks/useIssuedCards.tsx`)
- Extend `createCard` input type with optional `tap_to_pay?: boolean`; forward to edge function.

**Edge function** (`supabase/functions/stripe-issuing-create-card/index.ts`)
- Accept `tap_to_pay` (default true). Persist into `metadata.tap_to_pay` and Stripe card `metadata[tap_to_pay]=true` so the wallet-provisioning eligibility is recorded. (Stripe Issuing virtual cards are wallet-provisionable by default; flag is stored for UI gating + future push provisioning.)

**Card visual** (`VirtualCardVisual.tsx`)
- Add a small contactless/wave icon (lucide `Wifi` rotated) when `tapToPay` prop is true.

**Detail page** (`EfinCardDetailPage.tsx`)
- Read `metadata.tap_to_pay`. Show a "Tap to pay enabled" chip near the status pill.
- Add buttons: `Add to Apple Pay` / `Add to Google Pay` that:
  - On desktop → toast "Open eFinMoney on your iPhone/Android to add this card to your wallet."
  - (Real push-provisioning requires native SDK; out of scope for web preview, documented in code comment.)

### 3. Out of scope
- No DB schema change (uses existing `metadata jsonb`).
- No native iOS/Android push-provisioning code (web app cannot do it; surfaced as guidance).
- File names, routes, and table names stay as-is to avoid churn.

### Files touched
- `src/components/cards/EfinCardsSection.tsx`
- `src/components/cards/IssueVirtualCardModal.tsx`
- `src/components/cards/VirtualCardVisual.tsx`
- `src/pages/EfinCardDetailPage.tsx`
- `src/hooks/useIssuedCards.tsx`
- `supabase/functions/stripe-issuing-create-card/index.ts`
