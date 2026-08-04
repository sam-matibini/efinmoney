# Flags + residence-based recipient currency (Other & eFinMoney)

## 1. Flags render as plain letters

The transfer flows use emoji flags (`flagForCurrency`), which Chrome on Windows draws as the two letters "CA"/"US" instead of a flag — that is what the screenshot shows. The app already has a real flag-image component (`CurrencyFlag` / `CountryFlag`, backed by flagcdn) used on the dashboard and FX calculator.

Switch the remaining transfer surfaces to the image-based flags:

- eFinMoney flow: "From your wallet" selector, recipient "Receives in" trigger and every option, and the converted-amount/rate summary line.
- Other flow: the payment-method wallet selector rows ("Charge in"/wallet list) that currently print `flag_emoji`.

Result: consistent round flag images next to every currency code in both workflows.

## 2. Recipient currency should follow their country of residence

Today the recipient's receive currency comes from their stored account default. The recipient in the screenshot has no residence country recorded, so it fell back to a stored USD default, showing USD for a Canadian-sourced send.

New rule for the eFinMoney flow:

1. Recipient's residence country currency (their address country, then their profile country).
2. If no residence country is on file, fall back to the sender's wallet currency (so a CAD sender defaults to CAD, not USD).

The stored account default is no longer used to override this. The recipient can still change the currency manually in the dropdown.

For the Other (international) flow, the destination already follows the selected country, and picking a saved contact already switches the destination country/currency — this stays as is, and picking a contact with a country on file will keep driving the receive currency.

## Technical notes

- Migration: change `recent_efin_recipients`, `search_efin_recipients`, and `lookup_efin_recipient` to return `residence_country` (`coalesce(address_country, country_code)`) alongside the existing columns, instead of relying on the profile's default currency for `base_currency`.
- `src/components/send/EfinRecipientQuickPick.tsx`: carry `residence_country` through `SearchRow`, `RecentRow`, `QuickPickRecipient`.
- `src/components/send/EfinmoneyP2PFlow.tsx`: `addRecipient` sets `currency = countryToCurrency(residence_country) ?? sender.currency_code`; add that currency to `currencyOptions`; replace `flagForCurrency` spans with `<CurrencyFlag code={...} />`.
- `src/components/send/MethodCheckoutPanel.tsx` (Other flow wallet rows): replace `w.flag_emoji` with `<CurrencyFlag code={w.currency_code} />`.
- No pricing, ledger, or transfer-execution logic changes.
