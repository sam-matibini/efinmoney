# eFinMoney — Product & System Documentation

| | |
|---|---|
| **Product** | eFinMoney |
| **Website** | https://www.efin.money |
| **Document type** | Product & system documentation |
| **Audience** | Product, engineering, QA, compliance, partners |
| **Version** | 1.0 — July 2026 |
| **Platform** | Web application (responsive) |

---

## 1. Introduction

### 1.1 Purpose of this document

This document describes what **eFinMoney** is, how it is structured, which capabilities are available to customers and staff, and how money movement is organized across corridors and providers. It is intended as a shared reference for understanding the product so teams (including QA) can design processes, reviews, and test coverage from a clear description of behaviour—not as a test plan itself.

### 1.2 Product summary

eFinMoney is a **multi-currency digital wallet and cross-border money platform**. Customers create accounts, complete identity verification, hold balances in multiple fiat currencies, fund those wallets, send money to bank accounts or mobile-money wallets, exchange currencies, manage payees, and (where enabled) use cards, bill payment, and related services.

The product is oriented toward **Africa ↔ Western** corridors (for example Nigeria, Ghana, Zambia, and CAD/USD/EUR/GBP), with a customer experience that presents **payment methods** under eFinMoney branding rather than naming underlying payment service providers.

### 1.3 Design principles

- **Multi-rail**: More than one funding or payout path may be offered for the same currency; the customer chooses a method.
- **White-label customer UI**: Customers see method labels such as *Express card*, *Pay by invoice*, *Card or bank transfer*, *Mobile money*, or *Interac e-Transfer*—not provider brand names on top-up and send choosers.
- **Feature gating**: Capabilities can be enabled or disabled via configuration without removing backend support.
- **KYC-first access**: Full use of the app shell is tied to identity verification progress.

---

## 2. System architecture (overview)

### 2.1 Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite, React, TypeScript, shadcn/ui |
| Auth & database | Supabase (Auth, Postgres, Realtime) |
| Backend APIs | Supabase Edge Functions (Deno) |
| Hosting | Production web at efin.money; backend on Supabase |

### 2.2 Logical components

1. **Marketing & legal site** — public pages (landing, features, privacy, terms, compliance).
2. **Customer application** — authenticated wallet, send, top-up, exchange, contacts, etc.
3. **Onboarding & KYC** — Persona-led identity; optional Sumsub for enhanced due diligence (admin).
4. **Admin / compliance portal** — staff tools for users, KYC, AML, finance, operations.
5. **Payment rails** — Edge Functions integrating PSPs for collection (top-up) and payout (send).
6. **Ledger / wallets** — per-currency wallet balances and transfer/journal history.

### 2.3 High-level money flow

```
Customer wallet (currency)
        │
        ├─ Top-up (collection) ──► PSP ──► webhook / verify ──► credit wallet
        │
        ├─ Send (payout) ───────► debit wallet ──► PSP payout ──► beneficiary
        │
        └─ Exchange ────────────► debit currency A / credit currency B
```

---

## 3. Users and access

### 3.1 Customer users

| Stage | Description |
|-------|-------------|
| Registration | Email/password (Supabase Auth); confirmation and password reset supported |
| PIN | App PIN with reset flow |
| Onboarding | Welcome → identity verification → approved / enhanced / rejected paths |
| App access | Dashboard and money features after KYC gating rules are satisfied |

### 3.2 Staff users

Staff access the **admin portal** (`/admin/*`) with role-based permissions (for example admin, finance, compliance). Capabilities include KYC review, user management, AML workflows, revenue/pricing views, support/communication, and API diagnostics.

### 3.3 Identity verification

| Provider | Role |
|----------|------|
| **Persona** | Primary customer identity verification during onboarding |
| **Sumsub** | Enhanced due diligence tools used from the admin KYC review context |

Privacy and compliance pages describe customer-facing verification expectations; Sumsub is primarily an operations capability.

---

## 4. Customer application — modules

### 4.1 Dashboard

Home view of the customer’s financial activity: wallet snapshot and entry points to send, top up, exchange, and related actions.

**Route:** `/dashboard`

### 4.2 Wallets

Customers hold **one wallet per currency**. They can create wallets for supported currencies (commonly including NGN, USD, CAD, KES, GBP, EUR, GHS, UGX, TZS, ZMW, and others in the catalog), view balances, and open statements.

| Capability | Route |
|------------|-------|
| Wallet list / create | `/wallets` |
| Statement | `/wallets/:walletId/statement` |

### 4.3 Top up (fund wallet)

Customers fund a selected wallet via `/wallet/topup`. Available methods depend on the **wallet currency** and **feature configuration**. Multiple methods may appear for the same currency (multi-rail).

#### Customer-facing method labels

| Label shown to customer | Typical currencies | Underlying rail (internal) |
|-------------------------|--------------------|----------------------------|
| Express card | NGN; USD/EUR/GBP; CAD (charged as USD, credited CAD) | Nomba |
| Card or bank transfer | USD/EUR/GBP; CAD (via USD charge) | Fincra hosted checkout |
| Pay by invoice | USD, EUR, GBP, CAD | Paytota |
| Interac e-Transfer | CAD | Fincra Interac (when enabled) |
| Mobile money / Ghana MoMo | GHS | Ghana Pay |
| Mobile Money | ZMW (MTN, Airtel, Zamtel) | Elicate |
| Mobile money | XAF, KES, XOF, UGX | Swychr |

**Important product behaviour — CAD:** Card/checkout rails that cannot charge CAD directly may **charge in USD** and **credit the CAD wallet**, with the quote UI explaining the conversion. Interac is a separate CAD-native collection path when that feature is enabled.

**Important product behaviour — Fincra USD:** For USD as charge currency, card is the primary method; bank transfer is not offered for USD on that rail. EUR/GBP may support card and bank transfer.

After payment, customers return via deposit/payment callback routes; balances update when verification or webhooks confirm success.

### 4.4 Send money

Customers send from a funded wallet to a beneficiary (bank or mobile money) via `/send`.

**Live send corridors under default product configuration:**

| Corridor | Typical payout | Notes |
|----------|----------------|-------|
| Nigeria (NG) | Bank account | Primary international/Africa bank send path |
| Ghana (GH) | Mobile money or bank (as offered in UI) | Ghana Pay |
| Zambia (ZM) | Mobile money (MTN / Airtel / Zamtel) | Elicate |

Other African corridors (for example Kenya, Uganda, Tanzania, Rwanda) may be offered when the *other African corridors* feature is enabled. Optional alternate payout toggles (for example UGX via Paytota) may appear when configured.

Send flows typically include: select corridor/beneficiary → amount → quote (fees/FX where applicable) → confirm → tracking under Transfers.

Related routes:

| Route | Purpose |
|-------|---------|
| `/send` | Primary send |
| `/transfers`, `/transfers/:id` | History and tracking |
| `/transactions/:journalId` | Ledger detail |
| `/transfers/canada` | Canada domestic send (when enabled) |
| `/send/cpn` | Crypto/CPN send (when enabled) |
| `/send/african-card` | African card send (when Stripe features enabled) |

Bank linking via **Plaid** may be available as a funding option on send when configured.

### 4.5 Receive money

Via `/wallet/receive`, customers can:

- View **in-network** receive details (account number / eFin tag)
- View **virtual account** information for supported currencies where provisioned
- Create **Zambia mobile-money payment links** (fixed or flexible amount) when the Zambia/Elicate capability is enabled—these are distinct from escrow “payment links” described below
- See informational guidance for Canada Interac where applicable (collection may be separate from domestic send)

### 4.6 Exchange

Fiat currency exchange between wallets is available at `/exchange`. Crypto trading surfaces are configuration-gated.

### 4.7 Contacts (payees)

Customers maintain a payee directory at `/contacts` (also `/payees`).

**Categories:** Person, Supplier, Employee, Contractor, Payee/Vendor, Other.

**Directory fields include:**

- Full name / business name  
- Nickname (optional)  
- Email (optional)  
- Phone (optional; required when default payout is Mobile)  
- Mailing address (optional): street, city, state/province, postal code  
- Country  
- Default payout method: None, EFT (Canada), Interac, Mobile, Bank  
- Method-specific details (EFT institution/transit/account, Interac email, bank account details, mobile network as applicable)  
- Notes and tags  

Contacts can be used to start a send with prefilled beneficiary details.

### 4.8 Cards

When cards are enabled (`/cards`), customers can manage card products. Virtual cards via Swychr may be available when that rail is enabled. Stripe-based card funding and Connect surfaces are separately gated and may be off in the default product configuration.

### 4.9 Bill payment and airtime

When bill pay is enabled:

- `/pay-bills` — bill categories (airtime, cable, utilities, and others as catalogued)
- `/pay-bills/canada` — Canada bill pay
- Swychr airtime purchase may appear in the bills experience when Swychr is enabled

### 4.10 Payment links (escrow)

Escrow-style payment links (`/payment-links`, claim via `/claim/:code`, short links `/s/:code`) are a separate product surface from Zambia MoMo receive links. Escrow payment links are feature-gated and may show as coming soon when disabled.

### 4.11 Profile, security, support

| Route | Purpose |
|-------|---------|
| `/more` | Settings hub |
| `/profile` | Profile settings |
| `/kyc` | KYC status / actions |
| `/security` | Security settings |
| `/support` | Support |

### 4.12 Marketing and legal (public)

| Route | Purpose |
|-------|---------|
| `/` | Landing |
| `/features`, `/how-it-works`, `/about`, `/contact` | Marketing |
| `/privacy`, `/terms`, `/compliance` | Legal and compliance disclosures |
| `/auth`, `/auth/confirm`, `/auth/reset-password` | Authentication |
| `/reset-pin` | PIN reset |
| `/portal` | Customer portal entry |

---

## 5. Payment rails reference

This section documents **internal** rails for engineering and operations. Customer UI should continue to use the labels in §4.3.

### 5.1 Collection (top-up)

| Rail | Currencies / notes | Edge function family (examples) |
|------|--------------------|----------------------------------|
| Nomba | NGN; international card; CAD via USD | `nomba-collection`, callbacks, banks, resolve |
| Fincra checkout | USD/EUR/GBP; CAD via USD charge | `fincra-initialize-checkout`, `fincra-verify-payment`, `fincra-webhook` |
| Fincra Interac | CAD Interac collections | `fincra-cad-interac` (+ webhook handling) |
| Paytota | Invoice for USD/EUR/GBP/CAD | `paytota-collection`, `paytota-webhook` |
| Ghana Pay | GHS MoMo | `ghana-collection`, callbacks |
| Elicate | ZMW MoMo | `elicate-charge`, `elicate-checkout`, `elicate-webhook`, status/stream |
| Swychr | XAF/KES/XOF/UGX payin | `swychr-collection`, payin verify/webhook |
| Flutterwave | Legacy / gated | `flw-*` |

### 5.2 Payout (send)

| Rail | Typical use |
|------|-------------|
| Nomba | Nigeria bank payouts; FX/conversion related APIs |
| Ghana Pay | GHS MoMo/bank payouts |
| Elicate | ZMW MoMo payouts (`elicate-payout`) |
| Paytota | Optional UGX MoMo payout |
| Fincra | Optional African payout toggle where configured |
| Swychr | Payout / NGN fallback where configured |
| Paysafe / Interac | Canada domestic (when enabled) |
| Flutterwave | Legacy bills and historical payout paths |

### 5.3 Ancillary rails

| Capability | Notes |
|------------|-------|
| Plaid | Link external bank accounts |
| Swychr cards | Virtual card issue and operations |
| Swychr airtime | Catalog and recharge |
| Elicate payment links | ZMW MoMo receive links |
| Stripe / Adyen / Circle / Stellar | Present in backend; many customer surfaces gated off by default |

### 5.4 Multi-rail policy

Adding a new rail must **not** remove an existing live rail for the same currency. The customer chooses among available methods. Exclusivity (forcing a single provider) is not the product rule.

---

## 6. Feature configuration

Product visibility is controlled in `src/lib/productFeatures.ts`, overridable with `VITE_FEATURE_*` environment variables.

| Feature key | Default (July 2026) | Effect when enabled |
|-------------|---------------------|---------------------|
| `nombaNigeria` | On | NGN Express card; Nomba send/FX paths |
| `ghanaPay` | On | GHS MoMo top-up and send |
| `elicate` | On | ZMW MoMo top-up, send, receive links |
| `paytota` | On | Pay by invoice for Western currencies |
| `paytotaPayout` | On | UGX MoMo payout option on Send |
| `fincra` | On | Card or bank transfer top-up |
| `fincraInterac` | **Off** | CAD Interac e-Transfer top-up |
| `swychr` | On | Swychr top-up, cards, airtime surfaces |
| `plaid` | On | Bank link on send |
| `billPay` | On | Bill pay routes |
| `cards` | On | Cards route |
| `canadaDomestic` | **Off** | Canada domestic transfers |
| `paymentLinks` | **Off** | Escrow payment links |
| `flutterwave` | **Off** | Flutterwave top-up UI |
| `otherAfricanCorridors` | **Off** | Additional Africa send corridors live |
| `crypto` | **Off** | Crypto send/exchange surfaces |
| `stripe` | **Off** (hardcoded) | Stripe Connect / African card send |
| `adyen` | **Off** | Adyen surfaces |

Disabled features typically show a **Coming soon** experience rather than a broken page.

---

## 7. Admin and compliance portal

Staff use `/admin/login` and the admin layout. Major areas:

| Area | Examples of routes / purpose |
|------|------------------------------|
| Dashboard | `/admin/dashboard`, board dashboard |
| KYC | Queue and review; KYC config; risk tiers |
| Users & staff | User list/detail; staff onboarding and training |
| Finance | Finance, revenue, pricing |
| Operations | Operations hub, incidents, settlement reconciliation |
| Communication | Communication hub, support inbox |
| AML / compliance | AML policy, CDD, EDD, sanctions, PEP, STR, transaction monitoring, trade AML |
| Regulatory | LCTR, EFTR, wire transfers, travel rule, geographic risk, correspondent banking |
| Controls | Period-end controls, evidence repository, regulatory changes |
| Security | Security monitoring, operational risks |
| Diagnostics | System diagnostics, audit log, API management, data export |
| Payments (ops) | Adyen admin links/transactions where used |

Admin screens may display provider names for operational clarity; the white-label rule applies to **customer** money-movement UI.

---

## 8. End-to-end product journeys (narrative)

### 8.1 New customer

1. Discovers eFinMoney via marketing site.  
2. Registers and confirms authentication.  
3. Completes onboarding and Persona identity verification.  
4. On approval, accesses dashboard and creates one or more currency wallets.  

### 8.2 Fund and send (Africa)

1. Opens Top up, selects e.g. NGN, GHS, or ZMW wallet.  
2. Completes the presented mobile money or card method.  
3. Balance updates after confirmation.  
4. Adds or selects a contact (bank or MoMo).  
5. Sends via Send; tracks status under Transfers.  

### 8.3 Fund CAD / USD wallet

1. Selects CAD or USD (or EUR/GBP) wallet.  
2. Chooses among Express card, Card or bank transfer, and/or Pay by invoice (as configured).  
3. For CAD card paths, may pay in USD equivalent and receive CAD credit.  
4. Optionally uses Interac when that feature is turned on.  

### 8.4 Receive in Zambia

1. Opens Receive.  
2. Creates a MoMo payment link (fixed or open amount).  
3. Payer completes mobile money; wallet is credited when the provider confirms.  

### 8.5 Exchange

1. Holds two fiat wallets.  
2. Uses Exchange to convert at the quoted rate/fees.  
3. Both balances update.  

---

## 9. Operational notes and known constraints

These are product/environment realities that affect how the system behaves in production:

1. **CAD card top-up** often uses a USD charge currency with CAD wallet credit.  
2. **Fincra Interac** is implemented but may be off by default until alias/credentials and flag are ready.  
3. **Merchant enablement** at the PSP (e.g. USD card processing) can block otherwise valid customer cards.  
4. **Canada domestic send** and **escrow payment links** may be coming soon while Zambia MoMo receive links remain available.  
5. **Nomba upstream credentials** (e.g. JWT) can break payouts while directory/lookup APIs still succeed.  
6. **Local development redirects** after hosted checkout may return to the configured production app URL.  
7. Prefer `productFeatures.ts` over older markdown rail lists when determining what is live in the UI.  

---

## 10. Glossary

| Term | Definition |
|------|------------|
| Wallet | Customer balance in a single currency |
| Corridor | Country/currency path for sending money |
| Rail / PSP | Payment service provider powering collection or payout |
| MoMo | Mobile money |
| White-label | Customer sees eFinMoney method names, not PSP brands |
| Edge Function | Serverless backend API on Supabase |
| KYC / CDD / EDD | Know Your Customer / Customer Due Diligence / Enhanced Due Diligence |
| Multi-rail | Multiple providers offered for the same currency or flow |

---

## 11. Document control

| Item | Detail |
|------|--------|
| Product name | eFinMoney |
| Primary code references | `src/lib/productFeatures.ts`, `src/lib/walletTopupGateway.ts`, `src/App.tsx`, top-up/send/receive/contacts pages, `supabase/functions/*` |
| Related internal notes | `docs/PRODUCT_RAILS.md`, `docs/swychr/README.md` |
| Update when | Feature-flag defaults change, new corridor goes live, or customer-facing method labels change |

---

*End of document — eFinMoney Product & System Documentation*
