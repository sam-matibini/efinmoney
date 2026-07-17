# Product rails — live vs coming soon

This document reflects the **UI simplification pass** (July 2026). Edge functions and database objects for dormant rails remain in the repo until a backend cleanup pass.

## Live in the app (user-facing)

| Rail | Currencies / use | Frontend | Edge functions |
|------|------------------|----------|----------------|
| **Nomba Nigeria** | NGN bank send, NGN/USD/EUR/GBP top-up, NGN FX; **CAD top-up via USD international checkout** | `SendPage`, `TopUpPage`, `ExchangePage`, `NombaTopUpCard` | `nomba-collection`, `nomba-payment-callback`, … |
| **Ghana Pay** | GHS top-up, GHS MoMo send | `GhanaTopUpCard`, send flow for GHS | Ghana collection/payout functions (lenhub) |
| **Swychr Connect** | Secondary payin, NGN payout fallback, vCards, airtime | `SwychrTopUpCard`, `SwychrCardsPanel`, `SwychrAirtimePanel` (flagged off) | `swychr-collection`, `swychr-payout`, `swychr-card-*`, `swychr-airtime-*` |
| **Plaid** | Link external bank accounts | Send funding (`plaid` flag), settings | Plaid link-token functions |
| **Wallets & FX** | Multi-currency balances, fiat exchange | `WalletsPage`, `ExchangePage` (Currency tab) | Wallet ledger, `execute-transfer` (wallet-funded) |

Feature flags: `src/lib/productFeatures.ts` (override with `VITE_FEATURE_*` in `.env`).

## Coming soon (gated in UI)

| Surface | Flag | Routes / components |
|---------|------|---------------------|
| Canada domestic (Interac, EFT, Paysafe) | `canadaDomestic` | `/transfers/canada`, `CanadaSendFlow` |
| Stripe / cards | `stripe`, `cards` | `/cards`, card funding on send, `/stripe-connect` |
| Flutterwave & other Africa | `flutterwave`, `otherAfricanCorridors` | FLW top-up, KES/UGX/TZS/RWF/ZMW send UI |
| Crypto / Stellar | `crypto` | Exchange crypto tab, `/send/cpn` |
| Bill pay | `billPay` | `/pay-bills`, `/pay-bills/canada` |
| Swychr (all rails) | `swychr` | Top-up, payout fallback, cards, airtime — secondary provider |
| Payment links | `paymentLinks` | `/payment-links`, `/claim/:code` |

Disabled features show `ComingSoon` via `FeatureGate` / `GatedPage`.

## Legacy backend (not user-facing)

These remain deployed for ops, webhooks, and a future re-enable:

- Flutterwave (`flw-*`, execute-transfer FLW fallback — currently disabled for Nomba debug)
- Stripe (`stripe-*`, Visa Direct)
- Adyen, Fincra, Elicate, PawaPay, Paysafe, Stellar/Circle (CPN)
- Bill-pay and payment-link claim handlers
- Swychr Connect (`swychr-*`) — sandbox; enable with `SWYCHR_ENABLED=true` + `VITE_FEATURE_SWYCHR=true`

Admin: **API Management** at `/admin/api` (FLW/Stripe corridor probes marked legacy).

## Smoke-test checklist

1. **NGN top-up** — `/wallet/topup` → Nomba card for NGN wallet.
2. **GHS top-up** — Ghana Pay card for GHS wallet.
3. **NGN send** — `/send` → Nigeria bank beneficiary → expect Nomba routing (upstream JWT must be valid).
4. **Plaid link** — Send flow → Bank funding → link token (requires Plaid secrets).
5. **Gated routes** — `/cards`, `/pay-bills`, `/send/cpn` show Coming Soon with default flags.
6. **Swychr sandbox** — `deno run --allow-env --allow-net scripts/swychr-smoke-test.ts` (requires `SWYCHR_EMAIL` / `SWYCHR_PASSWORD`).

## Known blockers

- **Nomba JWT expired** — lenhub upstream credential; read APIs (banks, lookup, exchange) may work while transfer/conversion fail until provider refreshes JWT.
