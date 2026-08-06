# Tidy the Bank transfer panel

## What changes

1. **Remove the amber note** under the bank form ("Bank transfers aren't live for USD yet — your account is saved for reuse…"). The form simply saves the account with the existing success toast.
2. **Remove the "Paying / Enter an amount above" summary row** at the top of the panel — the amount is already captured in the field above the payment methods.

Everything else stays: country selector, country-specific fields (EFT / ACH / NUBAN), saved and Plaid-linked accounts, and the submit button that reads "Get bank details" when the rail is live or "Save bank account" when it is not.

## Technical notes

- `src/components/payments/WiseTopUpCard.tsx`: delete the `Paying` summary block and the `{!configured && (...)}` amber paragraph inside the `!intent` branch. Keep `configured` for the button label and submit behaviour.
- No other files, edge functions, or schema changes.
