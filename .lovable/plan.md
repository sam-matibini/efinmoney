# Bank transfer panel: always show the account form

## What's wrong

The new country-specific form is only rendered when the Wise bank rail reports itself as configured. This project has no Wise API token set, so the panel collapses to the amber "Bank transfer top-up is not available yet" line and no fields appear at all — exactly what the screenshot shows.

## What changes

- The bank account form (country selector + EFT / ACH / NUBAN fields per country) renders in the Bank transfer panel at all times, configured or not.
- The amber note is reworded and demoted to a hint under the action, explaining that instructions will follow once the transfer rail is live — it no longer replaces the form.
- The primary button adapts:
  - rail live and amount entered — "Get bank details" (creates the transfer intent as today),
  - rail not live — "Save bank account", which stores the account for reuse and confirms with a toast, without calling the intent function.
- Saved and Plaid-linked accounts still list above the form for one-tap reuse.
- The amount still comes only from the top-of-page field; no second amount box.

## Technical notes

- `src/components/payments/WiseTopUpCard.tsx`: drop `configured` from the render gate around `BankDetailsForm`; keep it only to decide the submit label and whether `handleCreate` runs after the account is saved.
- `src/components/payments/BankDetailsForm.tsx`: allow the submit button to stay enabled when the caller passes `submitDisabled=false` in save-only mode; no other change.
- No edge function, schema, or ledger change.
