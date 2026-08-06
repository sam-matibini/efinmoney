# Top-up: single amount field + bank linking

## 1. Remove the duplicate amount box

The wallet/amount row at the top of the top-up page is the single source of truth. Today each provider panel (Wise, Interac, Swychr, mobile money, Ghana, Elicate, Lenhub, Paytota, Adyen) still renders its own "Amount (CCY)" input, so users type the amount twice.

Change: every provider panel accepts the amount from the page and hides its own amount input when embedded. The panel keeps its minimum/validation rules, but shows them as an inline hint tied to the top field (e.g. "Minimum 1.00 CAD") instead of a second box. Action buttons ("Get bank details", "Continue", "Pay") stay, and are disabled until the top amount is valid.

A few panels (Dodo, Nomba, Flutterwave hosted) already support this — the rest get the same treatment for consistency.

## 2. Bank category: link a bank or quick-add an account

When the user picks the **Bank** category, in addition to the existing provider rails they see two entries at the top of the list:

- **Link your bank** — runs the existing Plaid link flow (Canada/US). Linked accounts then appear as selectable rows with institution name and last four.
- **Quick add bank account** — a manual form for countries Plaid does not cover.

The manual form's fields adapt to the wallet/country:

```text
Canada   Institution number (3) · Transit number (5) · Account number
US       Routing number (9) · Account number · Account type
Nigeria  Bank (searchable list) · NUBAN account number (10)
Zambia   Bank · Account number · Branch (optional)
Kenya    Bank · Account number · Branch code
Ghana    Bank · Account number
UK       Sort code (6) · Account number (8)
EU       IBAN · BIC/SWIFT (optional)
Other    Bank name · Account number · SWIFT/BIC
```

Each field gets country-correct label, length, input mode and validation; the submit button stays disabled until the country's required fields pass. Saved accounts are reusable on later top-ups.

## Technical notes

- New `src/lib/bankFieldSchemas.ts`: a country ISO → field descriptor array (key, label, type, maxLength, pattern, required, helper). Used to render and validate the manual form.
- New `src/components/payments/LinkBankPanel.tsx`: presentational panel with saved-account list, "Link bank" (Plaid via `plaid-create-link-token` / `plaid-exchange-token`, same handlers as `CanadaTransferPage`), and the schema-driven quick-add form. Rows use the existing dashed Quick Add styling from `MethodCheckoutPanel`.
- Saved manual accounts persist to the existing `linked_funding_sources` table (`source_type: 'bank'`), read through `useFundingSources('bank')`.
- `src/pages/TopUpPage.tsx`: register the bank-link entry as a `bank`-tone method, and pass `amount` + `embedded`/`hideAmount` to all provider cards.
- Provider cards updated to accept `initialAmount` + `embedded` and skip their own amount input: `WiseTopUpCard`, `CadInteracTopUpCard`, `SwychrTopUpCard`, `FlutterwaveMomoTopUpCard`, `GhanaTopUpCard`, `ElicateTopUpCard`, `LenhubFlutterTopUpCard`, `PaytotaTopUpCard`, `AdyenTopUpCard`.
- No edge function, pricing, or ledger changes; the only backend touchpoints are the existing Plaid functions and an insert into `linked_funding_sources`.
