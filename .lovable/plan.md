# Fix Canadian transfers: Interac unavailable + Pay-with-card not switching

## What's broken

**1. Interac fails with a generic error.**
The `paysafe-payout` edge function is returning Paysafe error `PAYMENTHUB-1: "The submitted payment type and currency code combination is not supported for your account"`. This is a **provider-side limitation** — your Paysafe merchant account isn't enabled for `INTERAC_ETRANSFER` in CAD. No amount of code can route around that; the only real fixes are (a) ask Paysafe support to enable Interac e-Transfer on your account, or (b) stop offering Interac in the UI. We'll do (b) for now.

**2. "Pay with card" tile doesn't visually switch.**
The funding selector currently uses two `<Button>` components side-by-side with `variant={funding === "card" ? "default" : "outline"}`. Click is wired, but on dark theme the outline/default contrast is subtle enough that users perceive "nothing happened", and the card form opens far below the fold so they don't see it scroll in. We'll rebuild this as an obvious selectable card with a check indicator + auto-scroll into view.

## Scope

Frontend only. No edge-function code changes, no DB changes. (Interac stays wired in the backend so it can be re-enabled instantly the day Paysafe approves it.)

## Changes

### `src/components/send/CanadaSendFlow.tsx`

**a. Hide Interac delivery method**
- Remove the `interac` button from the Delivery Method grid (Step 1). Grid becomes 2 columns: `Bank (EFT)` and `Instant to Card`.
- Change default `method` state from `"interac"` to `"eft"`.
- Remove the Step-2 Interac-only block (recipient email, security Q/A, message) — only EFT and card_push branches render.
- Remove the Step-3 Interac success copy.
- Leave the `DeliveryMethod` type and all Interac-related submit/reset code in place (dormant), so re-enabling is a one-line UI change later.

**b. Rebuild the "How are you paying?" funding selector**
- Replace the two `<Button>` tiles with two custom selectable cards (plain `<button type="button">` with Tailwind classes). Each card shows: icon, title, subtitle, fee badge, and a check circle in the top-right when selected.
- Selected state uses `border-primary ring-2 ring-primary/30 bg-primary/5`; unselected uses `border-border hover:border-primary/40`. This makes the active state unambiguous on dark theme.
- Wallet tile is disabled (greyed + cursor-not-allowed) when `noCadWallet` is true, with a small "No CAD wallet" caption.
- When `funding` switches to `"card"`, scroll the Stripe card-details panel into view with `panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })` so the user sees it immediately.

**c. Keep the existing card form, copy, and Send-button flow** — only the selector visuals + scroll change.

### Out of scope
- No changes to `paysafe-payout`, `execute-transfer`, or any other edge function.
- No DB migration.
- No change to the African/Flutterwave flow or P2P flow.
- No change to card_push (Stripe Visa Direct) wiring — already works.

## Verification
- Reload `/send` → Canada flow shows only **Bank (EFT)** and **Instant to Card** in Step 1.
- Step 2: click "Pay with card" → tile becomes visibly selected (primary border + check icon) and the Stripe card form scrolls into view.
- Submit an EFT or Instant-to-Card transfer end-to-end (those use working providers).
- Interac is no longer reachable from the UI; the prior "temporarily unavailable" toast can no longer be triggered by users.
