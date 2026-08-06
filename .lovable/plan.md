# Fix: top-up payment fields can't be clicked

## What's wrong

On `/wallet/topup`, the entire payment-method area is wrapped in a disabled overlay (`opacity-60 pointer-events-none`) whenever the amount at the top is empty or below the minimum. That blocks *everything* inside it — including inputs and buttons that have nothing to do with the amount, such as "Link your bank instantly", "Quick add bank account", the manual bank fields, phone/email fields and card fields. That is why the cells look greyed out and don't respond in the screenshot.

A second issue visible in the same screenshot: the saved-account list shows each Scotiabank account twice, because Plaid accounts and manually saved funding sources are rendered as two separate lists without de-duplication.

## The fix

1. **Stop freezing the whole panel.** Remove the blanket `pointer-events-none` wrapper. Methods stay selectable and their detail fields stay editable at all times.
2. **Gate only the payment action.** Each provider panel's final action button ("Pay", "Continue", "Get bank details") stays disabled until the amount is valid, with a short inline hint next to it ("Enter an amount of at least X CCY"). This keeps the guard that stops zero-value charges while letting people fill in details in any order.
3. **Keep the top hint** ("Enter an amount to enable payments") but reword it so it reads as informational rather than making the section look broken.
4. **De-duplicate the account list** in the bank panel: merge Plaid accounts and saved manual accounts into one list keyed by institution + last four, so an account linked both ways appears once.

## Technical notes

- `src/pages/TopUpPage.tsx`: drop the `amountValid ? undefined : "opacity-60 pointer-events-none"` wrapper around `CheckoutMethodList`; pass `amountValid` (and the minimum) down to provider cards that render a submit button.
- Provider cards already receive `initialAmount`; add an `amountReady` boolean folded into their existing `disabled` conditions rather than new state.
- `src/components/payments/LinkBankPanel.tsx`: build a single merged array from `plaidAccounts` and `savedBanks`, de-duped on `${institution}|${last_four}` before rendering.
- No backend, pricing, or ledger changes.
