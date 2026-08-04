# Make Linked Wallet optional when adding a card

Today, issuing a new prepaid/debit card blocks with "Select a linked wallet" unless a wallet is chosen. The wallet is only used to (a) set the card currency and (b) optionally move an initial amount onto the card — neither needs to be mandatory.

## What changes

- The "Linked Wallet" field becomes optional, labelled `Linked Wallet (optional)` with a "No wallet — fund later" choice in the dropdown.
- Removing the blocking validation: a card can be created with no wallet linked.
- When no wallet is selected:
  - The card is created in the account's default currency (CAD).
  - The "Initial fund" input is hidden, since there is no source wallet to move money from.
  - Helper text reads: "Skip this and fund the card later from any wallet."
- When a wallet is selected, behaviour is unchanged (currency from wallet, optional initial fund, balance check).

## Technical details

File: `src/components/modals/AddCardModal.tsx`

- Drop the `if (!isCredit && !walletId)` guard in `handleIssue`.
- Add a sentinel option (e.g. value `"none"`) to the wallet `Select`; map it to `walletId = ""`.
- In the create payload: `wallet_id: isCredit || !walletId ? null : walletId`, and `currency_code: selectedWallet?.currency_code ?? DEFAULT_CURRENCY` (from `src/lib/systemDefaults.ts`).
- Render the "Initial fund" block only when a wallet is selected.

No backend or schema changes; `virtual-card-ops` already accepts a null `wallet_id` and skips funding when no initial fund is passed.
