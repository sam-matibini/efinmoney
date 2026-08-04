# eFinMoney P2P: Country-Based Default Currencies + Flags

## Behaviour

1. **Sender wallet defaults to their country's currency.** On opening the eFinMoney tab, the "From your wallet" selector preselects the wallet matching the sender's domicile currency (from profile country, falling back to their stored preference, then CAD). If no such wallet exists, it falls back to the first wallet as today.
2. **Recipient "Receives in" defaults to the recipient's country currency.** When a recipient is added (quick-pick chip, type-ahead, or Find lookup), their receive currency defaults to the currency of their own domicile country instead of copying the sender's currency. If the recipient's country is unknown, it falls back to the sender's currency.
3. **Flags beside currencies.** Country flag emoji shown next to the currency code in:
   - the sender's "From your wallet" selector (already present — kept consistent),
   - the recipient "Receives in" dropdown (trigger and every option),
   - the rate line and received-amount summary where a currency code is displayed.

## Technical

- **Database (one migration):** extend `recent_efin_recipients`, `search_efin_recipients`, and `lookup_efin_recipient` to also return `base_currency` — derived as `coalesce(country_to_currency(coalesce(p.address_country, p.country_code)), p.default_currency)`. No new tables, no policy changes; functions keep their existing SECURITY DEFINER + rate-limit logic and masked-email behaviour.
- **`src/components/send/EfinRecipientQuickPick.tsx`:** carry `base_currency` through `QuickPickRecipient`, `SearchRow`, and `RecentRow`.
- **`src/components/send/EfinmoneyP2PFlow.tsx`:**
  - Sender default: use `countryToCurrency(profile.address_country || profile.country_code)` with `resolveBaseCurrency`/`SYSTEM_DEFAULT_CURRENCY` fallbacks (same pattern as `SendPage.tsx`) to pick the initial `selectedWalletId`.
  - `addRecipient`: set `currency` to `recipient.base_currency ?? sender.currency_code`.
  - Render `flagForCurrency(code)` from `@/lib/flags` next to currency codes in the "Receives in" select trigger/options and summary lines.
- Types regenerate after the migration; UI edits land afterwards.
