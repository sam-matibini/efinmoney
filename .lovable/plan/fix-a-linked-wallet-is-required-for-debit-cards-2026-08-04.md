# Fix "A linked wallet is required for debit cards"

The Add New Card modal already offers "No wallet — fund later", but issuing still fails: two older guards still demand a wallet — one in the app's card hook, one in the backend card function. Card payments do not need to be tied to a wallet.

## What changes

- Issuing a debit/prepaid card with "No wallet — fund later" succeeds. The card is created in CAD with a zero balance and can be funded from any wallet later.
- Behaviour with a wallet selected is unchanged (currency from the wallet, optional initial fund, balance check).
- Linking an existing external card still requires a wallet, since that card spends from a wallet.

## Technical details

`src/hooks/useCards.tsx`
- Remove the `if (!isCredit && !input.wallet_id) throw new Error('A linked wallet is required for debit cards')` guard in `createCard`.
- Send `wallet_id: isCredit ? null : (input.wallet_id || null)`.

`supabase/functions/virtual-card-ops/index.ts` (`createCardInner`)
- Drop the `if (!isCredit && !walletId) return jsonResponse({ error: "Linked wallet is required" }, 400)` check.
- Insert `wallet_id: isCredit || !walletId ? null : walletId`, and default `currency_code` to `CAD` when neither a currency nor a wallet is supplied.
- Initial funding already runs only when `walletId && initialFund > 0`, so it is skipped safely.
- Redeploy the function.

No schema or Send-flow changes.
