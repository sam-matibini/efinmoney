# Product rails — live vs coming soon

This document reflects the **UI simplification pass** (July 2026). Edge functions and database objects for dormant rails remain in the repo until a backend cleanup pass.

## Live in the app (user-facing)

| Rail | Currencies / use | Frontend | Edge functions |
|------|------------------|----------|----------------|
| **Nomba** | NGN bank send; Global Payout default for KE/GH/UG/TZ/RW/XOF/XAF/CAD/GBP/EUR/USD/ZAR (not ZMW); NGN/CAD top-up | `SendPage`, `TopUpPage`, `NombaTopUpCard` | `nomba-collection`, `nomba-payout`, `nomba-payment-callback`, … |
| **Ghana Pay** | GHS top-up, GHS MoMo send | `GhanaTopUpCard`, send flow for GHS | Ghana collection/payout functions (lenhub) |
| **Swychr Connect** | Secondary payin, NGN payout fallback, vCards, airtime | `SwychrTopUpCard`, `SwychrCardsPanel`, `SwychrAirtimePanel` (flagged off) | `swychr-collection`, `swychr-payout`, `swychr-card-*`, `swychr-airtime-*` |
| **Plaid** | Link CA/US banks, live balances, CAD top-up, same-company bank moves | Bank tab (`LinkedBanksCard`), Send funding | `plaid-create-link-token`, `plaid-exchange-token`, `plaid-refresh-balances`, `intra-ca-transfer-create` |
| **Fincra / Nomba / Verto** | Live partner disbursement balances on Company banks; NG/GH/KE bank-to-bank payouts from Fincra then Nomba (Verto is balance-only) | Bank tab (`LinkedBanksCard`, `PartnerRailsPanel`) | `partner-rail-balances`, `linked-bank-rail-payout`, `fincra-payout`, `nomba-payout`, `partner-balance-verto` |
| **Wallets & FX** | Multi-currency balances, fiat exchange | `WalletsPage`, `ExchangePage` (Currency tab) | Wallet ledger, `execute-transfer` (wallet-funded) |

Feature flags: `src/lib/productFeatures.ts` (override with `VITE_FEATURE_*` in `.env`).

## Coming soon (gated in UI)

| Surface | Flag | Routes / components |
|---------|------|---------------------|
| Canada domestic (Interac, EFT, Paysafe) | `canadaDomestic` | `/transfers/canada`, `CanadaSendFlow` |
| Stripe / cards | `stripe`, `cards` | `/cards`, card funding on send, `/stripe-connect` |
| Flutterwave & other Africa | `flutterwave`, `otherAfricanCorridors` | FLW top-up, KES/UGX/TZS/RWF send UI |
| Elicate (Zambia) | `elicate` (`VITE_FEATURE_ELICATE`) | ZMW MoMo top-up, send, payment links |
| Crypto / Stellar | `crypto` | Exchange crypto tab, `/send/cpn` |
| Bill pay | `billPay` | `/pay-bills`, `/pay-bills/canada` |
| Swychr (all rails) | `swychr` | Top-up, payout fallback, cards, airtime — secondary provider |
| Payment links | `paymentLinks` | `/payment-links`, `/claim/:code` |

Disabled features show `ComingSoon` via `FeatureGate` / `GatedPage`.

## Legacy backend (not user-facing)

These remain deployed for ops, webhooks, and a future re-enable:

- Flutterwave (`flw-*`, execute-transfer FLW fallback — currently disabled for Nomba debug)
- Stripe (`stripe-*`, Visa Direct)
- Adyen, Fincra, PawaPay, Paysafe, Stellar/Circle (CPN)
- Elicate Pay (`elicate-*`) — **live** ZMW MoMo; enable with `ELICATE_ENV=live` + `VITE_FEATURE_ELICATE=true`
- Bill-pay and payment-link claim handlers
- Swychr Connect (`swychr-*`) — **live** card `/api/card/prod` + airtime `/api/airtime/prod`; enable with `SWYCHR_ENABLED=true` + `VITE_FEATURE_SWYCHR=true` (card sandbox only if `SWYCHR_CARD_SANDBOX=true`)

Admin: **API Management** at `/admin/api` (FLW/Stripe corridor probes marked legacy).

## Smoke-test checklist

1. **NGN top-up** — `/wallet/topup` → Nomba card for NGN wallet.
2. **GHS top-up** — Ghana Pay card for GHS wallet.
3. **NGN send** — `/send` → Nigeria bank beneficiary → expect Nomba routing (upstream JWT must be valid).
4. **Plaid link + live balances** — Bank tab → Connect with Plaid (CA/US). Balances refresh via `plaid-refresh-balances` (requires Plaid secrets). Manual NG/GH/KE links still show the eFinMoney wallet, not the bank’s ledger.
4b. **Partner rails** — Business Bank tab shows Fincra / Verto / Nomba disbursement balances. Withdraw or send to a linked NG/GH/KE bank uses `linked-bank-rail-payout` (Fincra NUBAN, then Nomba) when the partner wallet covers the amount. Deploy `partner-rail-balances` and `linked-bank-rail-payout` separately from GitHub.
5. **Gated routes** — `/cards`, `/pay-bills`, `/send/cpn` show Coming Soon with default flags.
6. **Swychr sandbox** — `deno run --allow-env --allow-net scripts/swychr-smoke-test.ts` (requires `SWYCHR_EMAIL` / `SWYCHR_PASSWORD`).

## Known blockers

- **Nomba JWT expired** — lenhub upstream credential; read APIs (banks, lookup, exchange) may work while transfer/conversion fail until provider refreshes JWT.
