# Bank transfer panel: account details form, not an amount box

## What changes

The "Bank transfer" panel inside the top-up page currently asks for the amount again (already captured at the top of the page). Replace that input with a country-correct bank account form, so the panel collects the details the rail actually needs:

```text
Canada (EFT)   Bank name · Institution number (3) · Transit number (5) · Account number
US (ACH)       Bank name · Routing number (9) · Account number · Account type
Nigeria        Bank name · NUBAN account number (10)
Zambia/Kenya/Ghana/UK/EU/Other   existing per-country field sets
```

Behaviour:

- Country defaults from the wallet currency (USD to US/ACH, CAD to Canada/EFT, NGN to Nigeria) and can be changed with a country selector.
- Fields carry country labels, digit limits and validation; the action button stays disabled until the top amount is valid and the required fields pass.
- The panel header shows the amount being paid, taken from the top field ("Paying USD 25.00"), so there is no second amount box anywhere.
- After the details are submitted, the panel shows the receive-account details and payment reference exactly as it does today, plus the waiting state.
- When the bank rail is not configured for the currency, the amber "not available yet" note stays but the form is hidden instead of showing a dead amount box and button.
- The submitted account is saved as a reusable funding source, so returning users pick a saved account instead of retyping.

## Technical notes

- `src/components/payments/WiseTopUpCard.tsx`: drop the local amount `Input`; render the schema-driven fields via `bankSchemaForCountry` / `validateBankFields` from `src/lib/bankFieldSchemas.ts` (same helpers `LinkBankPanel` uses). Amount comes only from the `initialAmount` prop.
- Extract the shared field renderer (country select + inputs + errors + saved-account list) out of `LinkBankPanel.tsx` into a small `BankDetailsForm` component so both the bank-link method and the bank-transfer panel use one implementation.
- Saved accounts persist to `linked_funding_sources` (`source_type: 'bank'`, `country_code`, `details`) via the existing `useFundingSources('bank')` hook — no new table.
- `handleCreate` still calls `wise-topup-intent` with `{ action: 'create', amount, wallet_id }`; the collected account details are attached to the saved funding source only, so no edge function or ledger change is needed.
- `src/pages/TopUpPage.tsx` keeps passing `initialAmount`; add `embedded` so the panel knows to render in-page without its own amount row.
