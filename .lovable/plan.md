# Consistent flag rendering across the app

Right now flags come from three different sources, so they look different from screen to screen:

- Round flag images via `CurrencyFlag` / `CountryFlag` (`src/components/ui/FlagImage.tsx`) — the intended style.
- A local square/rectangular `Flag` inside `src/components/fx/LiveFxCalculator.tsx` — this is the mismatched CAD flag in the "You send" cell.
- Emoji flags (`flagForCurrency`, `flagForCountry`, `country.flag`, `wallet.flag_emoji`, `currencies.flag_emoji`) used in wallet lists, dropdowns, modals and pickers — these render inconsistently (and as letter pairs on Windows).

## What changes

1. Single source of truth for flags: every currency or country flag in the UI renders through `CurrencyFlag` / `CountryFlag` (round flagcdn image, sized `xs`/`sm`/`md`, globe fallback, crypto keeps its coin/token mark).
2. Remove the local `Flag` in `LiveFxCalculator` and use `CurrencyFlag` in both the paired "You send / They receive" row and the standard layout, so the send and receive sides match.
3. Replace emoji flag usage in the app surfaces that show currency/country next to an amount or in a selector:
   - Wallets: WalletsPage, WalletCarousel, HeroBalance, WalletStatementPage, ExchangePage, TransfersListPage, admin UserDetailPage.
   - Wallet/currency dropdowns in modals: Deposit, PayBills, MobileMoney, FundCard, CardPaymentForm, CreateWallet, EditWallet, DeleteWallet, ReceiveMoney, Savings, IssueVirtualCard, QuickExpense, Swychr panels, CryptoTradingPanel.
   - Country pickers: Auth, onboarding business details, EditUserDialog, ContactsPage, AddBeneficiaryModal, SendPage destination/summary rows, admin PricingPage.
4. `src/lib/flags.ts`: keep the country-code/ISO resolution helpers, deprecate the emoji maps (`CURRENCY_FLAG`, `COUNTRY_FLAG`, `flagForCurrency`, `flagForCountry`, `flagForCountryName`) so no new code uses emoji flags. Marketing/landing decorative usages stay as-is only where no currency code is shown.

## Database

- Add a `country_code` (ISO-3166 alpha-2, nullable for crypto) column to `currencies` and backfill it for every fiat currency, so flags derive from a stable code instead of an emoji string.
- Keep `flag_emoji` in place (still referenced by older records) but stop reading it in the UI; wallets inherit their flag from the currency's `country_code`.

## Technical notes

- `CurrencyFlag` already maps currency → ISO code through `WORLD_CURRENCY_MAP`; the backfill uses that same mapping so DB and client agree.
- Crypto currencies (BTC, ETH, USDC, …) get the token badge/globe fallback rather than a country flag.
- No changes to transfer, FX, or ledger logic — presentation only, plus the additive column.
