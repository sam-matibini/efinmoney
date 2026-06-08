## Goal

Keep Option A: collect **two cards** in the Canada send flow (sender's funding card + recipient's debit card for Visa Direct), make both sections clearly labeled, and fix the inactive recipient debit card fields.

## Scope

Frontend only — `src/components/send/CanadaSendFlow.tsx` and (if needed) `src/lib/stripe.ts`. No backend, payout routing, or fee logic changes.

## Changes

### 1. Clarify sender vs recipient card labels
- **Sender card section** (Step 2 "Pay with card" panel): retitle the panel to **"Your card (funds this transfer)"** with a one-line helper: *"We charge C$[total] from this card."* This removes confusion with the recipient block.
- **Recipient card section** (only shown when delivery = "Instant to Card"): keep current title **"Recipient's debit card (where funds land instantly)"** but move it visually so it sits clearly under the "Instant to Card" recipient block with an info note: *"Visa Direct / Mastercard Send pushes funds directly to this debit card. You (the sender) must enter it — the recipient does not get a separate page to fill in."*
- Show the recipient card block **only** when `method === "card_push"` (already the case) and never duplicate it elsewhere.

### 2. Fix inactive recipient debit card fields
Root cause confirmed: two `<Elements>` groups were sharing one Stripe instance, leaving the second group's iframes inert. The previous fix introduced `getStripeSecondary()` but the inputs are still reported inactive. Apply these adjustments:

- **Force a stable key on the nested `<Elements>`** so it remounts cleanly when `method` toggles to `card_push`, instead of being mounted while hidden and never receiving focus wiring.
- **Lazy-mount `RecipientCardSection`**: only render it after the user actually selects "Instant to Card" (it already is gated by `method === "card_push"`, but ensure no stale parent re-render is hiding it via CSS). Remove any wrapping container that has `pointer-events:none`, `opacity:0`, or `display:none` between mounts.
- **Verify `getStripeSecondary()`** in `src/lib/stripe.ts` actually resolves with the same publishable key as `getStripe()` and isn't returning `null` silently. If `ready === false` for the secondary, fall back to a single shared instance and warn in console — better degraded than dead.
- After mount, programmatically focus the recipient `CardNumberElement` once to confirm iframes are interactive; if `.focus()` throws, surface a clear error banner instead of a silent dead field.

### 3. Validation flow unchanged
- Sender card validity (`cardNumComplete && cardExpComplete && cardCvcComplete`) gates Step 2 only when funding=card.
- Recipient card validity (`recipientCardComplete`) gates Step 2 only when delivery=card_push.
- Both can be required simultaneously (card-funded → card_push delivery).

### 4. QA checklist before finishing
1. Select "Instant to Card" delivery + "Pay from wallet" funding → only **recipient** card fields render and accept input.
2. Select "Instant to Card" delivery + "Pay with card" funding → **both** sender and recipient card sections render, each accepts input independently, and labels make the distinction obvious.
3. Select "Bank (EFT)" + "Pay with card" → only **sender** card fields render.
4. No new console errors from Stripe Elements ("Cannot have two CardNumberElement…" etc.).
5. Submitting tokenizes the correct card(s) and the transfer succeeds end-to-end on test keys.

## Out of scope
- Backend payout logic, fee schedule, Stripe Connect onboarding.
- Replacing recipient card collection with a hosted recipient page (that's Option B, rejected).
