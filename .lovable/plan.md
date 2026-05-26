## Problem

On each wallet card in `WalletCarousel`, the three action buttons don't behave as routes:
- **Send** opens `SendMoneyModal` (and the click bubbles to the card, navigating to the wallet statement)
- **Receive** links to `/wallets` (generic list, not a receive view)
- **Top up** opens a top‑up modal (and also bubbles to the card)

## Fix (frontend only, single file)

Edit `src/components/dashboard/WalletCarousel.tsx`:

1. Replace the `SendMoneyModal` wrapper with a `<Link to={`/send?sourceWalletId=${w.wallet_id}`}>` styled identically. Add `onClick={(e) => e.stopPropagation()}` so the card's statement-navigation doesn't fire.
2. Change the Receive `<Link>` from `to="/wallets"` to `to={`/wallet/receive?walletId=${w.wallet_id}`}` (route already exists in `App.tsx`). Keeps existing `stopPropagation`.
3. Replace the Top up `<button>` (which set local `topUpWalletId` state) with a `<Link to={`/wallet/topup?walletId=${w.wallet_id}`}>` styled identically, with `stopPropagation`. Remove the now-unused `topUpWalletId` state and any `CardPaymentModal` it was driving.
4. Clean up unused imports: `SendMoneyModal`, `CardPaymentModal`, and `useState` if no longer used.

## Technical notes

- Routes already registered: `/send` (SendPage reads `sourceWalletId`), `/wallet/receive` (ReceivePage), `/wallet/topup` (TopUpPage). Receive/TopUp pages don't currently read `walletId`, but passing it is forward-compatible and doesn't break them.
- All three buttons must `stopPropagation` because the parent `TiltCard` has an `onClick` that navigates to the wallet statement.
- No backend, schema, or business-logic changes.