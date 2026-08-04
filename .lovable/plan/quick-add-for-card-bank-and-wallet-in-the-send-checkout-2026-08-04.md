# Quick Add for card, bank, and wallet in the send checkout

Add a consistent "Quick Add" action inside each payment-method checkout panel so a sender can add a new card, link a new bank, or create a new wallet without leaving the Send flow.

## What changes

**Card checkout panel**
- Show saved cards as a selectable list (brand + last four + expiry) when the user has any.
- Add a "+ Quick add new card" row at the bottom of the list (and as the primary action when no cards are saved) that opens the existing Add Card modal.
- Keep the existing "Charge in" selector, charge summary, and PCI/brand notes; the card-details helper text stays but sits under the card list.
- On success the new card is selected automatically.

**Bank panel**
- Keep the account picker, and add a "+ Quick add bank account" row under it that runs the existing bank-linking flow (currently only offered when zero accounts are linked).

**Wallet panel**
- Add a "+ Quick add wallet" row under the wallet selector that opens the existing Create Wallet modal; the newly created wallet becomes the selected one.

All three actions use the same compact dashed-row styling, tinted per method colour (card / bank / wallet), so the panels stay visually consistent.

## Technical notes

- `src/components/send/MethodCheckoutPanel.tsx`: add optional props `savedCards`, `selectedCardId`, `onCardChange`, `onAddCard`, `onAddWallet`, and render the Quick Add rows. No business logic added here — it stays presentational.
- `src/pages/SendPage.tsx`: wire the new props to existing state — `useSavedCards()` (already imported), `setAddCardOpen(true)` for the Add Card modal, `startPlaidLink` for bank, and a new local state flag to open `CreateWalletModal`. Auto-select the newest card/wallet when the respective query data refreshes.
- Reuses `AddCardModal`, `CreateWalletModal`, and the Plaid link handler already present in the page — no new endpoints, tables, or providers.
