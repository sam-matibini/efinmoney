# eFinMoney — QA Test Planning Guide

| | |
|---|---|
| **Product** | eFinMoney (`https://www.efin.money`) |
| **Document purpose** | Enable QA to design end-to-end and regression test cases |
| **Audience** | QA leads, test engineers, product UAT |
| **Version** | 1.0 — July 2026 |
| **Source of truth for flags** | `src/lib/productFeatures.ts` |
| **App stack** | Vite + React + TypeScript + Supabase (Auth, DB, Edge Functions) |

---

## 1. Product overview

**eFinMoney** is a multi-currency consumer fintech wallet for cross-border money movement, focused on Africa ↔ Western corridors (Canada, USD/EUR/GBP).

Users can:

1. Create and hold **multi-currency fiat wallets**
2. **Top up** wallets via several payment providers (shown under white-label method names)
3. **Send** money to bank accounts or mobile money (MoMo) beneficiaries
4. **Exchange** between fiat currencies
5. Manage **contacts/payees**
6. Optionally use **virtual cards**, **bill pay**, and **airtime** (when enabled)
7. Complete **KYC / identity verification** before full access

Internal payment providers (Nomba, Fincra, Paytota, Elicate, Swychr, Ghana Pay, Flutterwave, etc.) must **not** appear by brand name in customer top-up UI. Testers must assert the **user-facing labels** listed in §3.

---

## 2. Environments & access

| Item | Notes for QA |
|------|----------------|
| Production web | `https://www.efin.money` |
| Local / staging | Local Vite (`npm run dev`); Supabase project as configured in `.env` |
| Auth | Email/password (Supabase Auth); PIN reset flows exist |
| KYC gate | Most app shell routes require KYC progress via Persona |
| Admin | Separate `/admin/*` routes with staff roles |
| Feature flags | Client: `VITE_FEATURE_*` in env. Defaults in `productFeatures.ts` |
| Backend secrets | Edge Function secrets (not visible to QA UI) — PSP keys, webhooks |

**Test accounts needed**

- Unverified user (pre-KYC)
- KYC-approved user with funded wallets (NGN, GHS, ZMW, USD, CAD, etc.)
- Staff/admin (KYC review, API management)
- Beneficiaries: Nigeria bank, Ghana MoMo, Zambia MoMo, Canada Interac/EFT (directory only if Canada send gated)

---

## 3. White-label payment method map (critical for UI assertions)

| Internal rail | User-facing label | Typical use |
|---------------|-------------------|-------------|
| Nomba | **Express card** | NGN top-up; USD/EUR/GBP; CAD charged as USD then credited CAD |
| Fincra checkout | **Card or bank transfer** | USD/EUR/GBP; CAD via USD charge |
| Paytota | **Pay by invoice** | USD, EUR, GBP, CAD invoice collection |
| Fincra Interac | **Interac e-Transfer** | CAD only (feature flag usually **off**) |
| Ghana Pay | **Mobile money** / Ghana MoMo | GHS |
| Elicate | **Mobile Money** | ZMW (MTN / Airtel / Zamtel) |
| Swychr | **Mobile money** | XAF, KES, XOF, UGX top-up; also cards & airtime |

**Fail any case** where customer UI shows Nomba, Fincra, Paytota, Elicate, Swychr, Flutterwave brand names on top-up/send choosers (admin/API screens may still show PSP names).

---

## 4. Feature flags (defaults — July 2026)

Override with `VITE_FEATURE_<NAME>=true|false`.

| Flag key | Env var | Default | What QA sees when ON | When OFF |
|----------|---------|---------|----------------------|----------|
| `nombaNigeria` | `VITE_FEATURE_NOMBA_NIGERIA` | **true** | NGN Express card; NGN send | Hide Nomba NGN |
| `ghanaPay` | `VITE_FEATURE_GHANA_PAY` | **true** | GHS MoMo top-up/send | Hide Ghana |
| `elicate` | `VITE_FEATURE_ELICATE` | **true** | ZMW MoMo top-up/send/receive links | Hide Zambia Elicate |
| `paytota` | `VITE_FEATURE_PAYTOTA` | **true** | Pay by invoice on USD/EUR/GBP/CAD | Hide invoice option |
| `paytotaPayout` | `VITE_FEATURE_PAYTOTA_PAYOUT` | **true** | UGX MoMo payout toggle on Send | Hide toggle |
| `fincra` | `VITE_FEATURE_FINCRA` | **true** | Card or bank transfer top-up | Hide Fincra checkout |
| `fincraInterac` | `VITE_FEATURE_FINCRA_INTERAC` | **false** | CAD Interac e-Transfer top-up | “Not available” / hidden |
| `swychr` | `VITE_FEATURE_SWYCHR` | **true** | Swychr MoMo top-up, cards panel, airtime | Hide Swychr surfaces |
| `plaid` | `VITE_FEATURE_PLAID` | **true** | Bank link on send funding | Hide Plaid |
| `billPay` | `VITE_FEATURE_BILL_PAY` | **true** | `/pay-bills` | Coming Soon |
| `cards` | `VITE_FEATURE_CARDS` | **true** | `/cards` route | Coming Soon |
| `canadaDomestic` | `VITE_FEATURE_CANADA_DOMESTIC` | **false** | `/transfers/canada` live | Coming Soon |
| `paymentLinks` | `VITE_FEATURE_PAYMENT_LINKS` | **false** | Escrow `/payment-links`, `/claim` | Coming Soon |
| `flutterwave` | `VITE_FEATURE_FLUTTERWAVE` | **false** | FLW top-up UI | Hidden |
| `otherAfricanCorridors` | `VITE_FEATURE_OTHER_AFRICA` | **false** | KES/UGX/TZS/RWF as live send | Not live send |
| `crypto` | `VITE_FEATURE_CRYPTO` | **false** | Crypto exchange / CPN send | Coming Soon |
| `stripe` | *(hardcoded)* | **false** | Stripe Connect / African card | Always gated |
| `adyen` | `VITE_FEATURE_ADYEN` | **false** | Adyen | Hidden |

**Live top-up currencies** (when flags default): NGN, USD, EUR, GBP, CAD, XAF, KES, XOF, UGX, GHS, ZMW.

**Live send corridors** (when flags default): **Nigeria (NG)**, **Ghana (GH)**, **Zambia (ZM)** only.

---

## 5. Application map (routes)

### 5.1 Public / marketing

| Path | Purpose | Suggested test focus |
|------|---------|----------------------|
| `/` | Landing | Load, CTA to auth |
| `/features`, `/how-it-works`, `/about`, `/contact` | Marketing | Links, forms |
| `/privacy`, `/terms`, `/compliance` | Legal | Content loads |
| `/auth`, `/auth/confirm`, `/auth/reset-password` | Auth | Sign up, login, email confirm, password reset |
| `/reset-pin` | PIN reset | Request + confirm |
| `/s/:code` | Short link | Resolve valid/invalid code |
| `/claim/:code` | Claim escrow link | Gated by `paymentLinks` |
| `/deposit/complete`, `/payment-callback` | PSP return | Wallet credit after top-up |
| `/callback`, `/interac/callback` | Interac OAuth | Only if Interac flows enabled |

### 5.2 Authenticated customer app

| Path | Purpose | Gate |
|------|---------|------|
| `/dashboard` | Home balances / actions | KYC shell |
| `/wallets` | List/create wallets | — |
| `/wallets/:walletId/statement` | Statement | — |
| `/wallet/topup` | Fund wallet | — |
| `/wallet/receive` | Receive money / VAs / ZMW links | — |
| `/send` | Cross-border send | — |
| `/send/cpn` | Crypto send | `crypto` |
| `/send/african-card` | African card send | `stripe` |
| `/exchange` | FX | — |
| `/transfers`, `/transfers/:id` | History / tracking | — |
| `/transactions/:journalId` | Ledger detail | — |
| `/contacts`, `/payees` | Beneficiaries | — |
| `/cards`, `/cards/efin/:id` | Cards | `cards` |
| `/pay-bills`, `/pay-bills/canada` | Bills | `billPay` |
| `/payment-links` | Escrow links | `paymentLinks` |
| `/transfers/canada` | Canada domestic | `canadaDomestic` |
| `/more`, `/profile`, `/security`, `/support` | Settings hub | — |
| `/kyc`, onboarding `/onboarding/*` | Identity | — |

### 5.3 Admin / ops

| Area | Paths (examples) | Test themes |
|------|------------------|-------------|
| Access | `/admin/login`, `/admin/dashboard` | Role-based login |
| Users / staff | `/admin/users`, `/admin/staff`, `/admin/onboarding` | CRUD, invites |
| KYC | `/admin/kyc`, `/admin/kyc/:id` | Approve/reject; Sumsub EDD |
| Finance | `/admin/finance`, `/admin/revenue`, `/admin/pricing` | Balances, pricing |
| Compliance | AML, sanctions, STR, LCTR, EFTR, CDD, EDD, etc. | Workflows & forms |
| Ops | `/admin/operations`, incidents, reconciliation | Ops queues |
| API probes | `/admin/api` | Integration health (may show PSP names) |

---

## 6. Core user journeys (for test-case design)

### 6.1 Registration → KYC → dashboard

| Step | Expected |
|------|----------|
| 1. Sign up | Account created; email confirm if required |
| 2. Login | Session established |
| 3. Onboarding / KYC | Persona inquiry starts (`/onboarding/identity` or `/kyc`) |
| 4. Pending / approved / rejected | Correct routing to welcome, app, or rejected |
| 5. Dashboard | Wallets and primary CTAs visible when approved |

**Negative:** Incomplete KYC cannot fully use send/top-up as designed by `KYCGuard`.

### 6.2 Create wallet

| Step | Expected |
|------|----------|
| Open `/wallets` → Create | Modal lists popular currencies (e.g. NGN, USD, CAD, KES, GBP, EUR, GHS, UGX, TZS, ZMW) |
| Create NGN + CAD + ZMW | Three wallets appear with zero or correct balance |
| Duplicate currency | Blocked or no duplicate |

### 6.3 Top-up — by currency

Testers should open `/wallet/topup`, select wallet currency, and verify **method picker** matches flags.

#### A. NGN — Express card (Nomba)

| ID | Case | Expected |
|----|------|----------|
| TU-NGN-01 | Select NGN wallet | Express card method available |
| TU-NGN-02 | Enter amount → Continue | Redirect or card flow; no “Nomba” brand in customer UI |
| TU-NGN-03 | Successful payment return | Wallet balance increases; transfer/tx history entry |
| TU-NGN-04 | Cancel / fail | No credit; clear error |

#### B. GHS — Ghana Mobile Money

| ID | Case | Expected |
|----|------|----------|
| TU-GHS-01 | Select GHS | Ghana MoMo networks (MTN / AirtelTigo / Telecel) |
| TU-GHS-02 | Valid phone + amount | Collection initiated; OTP/USSD as provider requires |
| TU-GHS-03 | Success webhook | GHS wallet credited |

#### C. ZMW — Mobile Money (Elicate)

| ID | Case | Expected |
|----|------|----------|
| TU-ZMW-01 | Select ZMW | Mobile Money; networks MTN / Airtel / Zamtel |
| TU-ZMW-02 | OTP / approval flow | Charge completes |
| TU-ZMW-03 | Success | ZMW balance credit |

#### D. USD / EUR / GBP — multi-rail picker

| ID | Case | Expected |
|----|------|----------|
| TU-FX-01 | Select USD (flags default) | Options include **Express card**, **Card or bank transfer**, **Pay by invoice** (as enabled) |
| TU-FX-02 | Express card path | Completes and credits wallet |
| TU-FX-03 | Card or bank transfer | Hosted checkout; EUR/GBP may offer bank_transfer; **USD is card-only** on Fincra |
| TU-FX-04 | Pay by invoice | Invoice issued; credit on payment |
| TU-FX-05 | White-label | No PSP brand names on chooser |

#### E. CAD — multi-rail (important)

| ID | Case | Expected |
|----|------|----------|
| TU-CAD-01 | Select CAD | Method picker: Express card, Card or bank transfer, Pay by invoice; Interac only if `fincraInterac` |
| TU-CAD-02 | Express card / Fincra card | **Charge currency is USD**; **credit currency is CAD** (quote UI should explain conversion) |
| TU-CAD-03 | Interac when flag off | Not offered or “coming soon” |
| TU-CAD-04 | Interac when flag on | Interac e-Transfer instructions; credit on match |
| TU-CAD-05 | Merchant not enabled for USD card | Clear failure from Fincra (account config), not silent |

#### F. Swychr MoMo currencies (XAF, KES, XOF, UGX)

| ID | Case | Expected |
|----|------|----------|
| TU-SWY-01 | Select KES/UGX/etc. | Mobile money top-up UI |
| TU-SWY-02 | Complete payin | Wallet credited |

### 6.4 Send money

Open `/send`. Live corridors by default: **NG, GH, ZM**.

| ID | Case | Expected |
|----|------|----------|
| SND-01 | Send to Nigeria bank beneficiary | Account resolve (where available); fee/FX quote; success → tracking |
| SND-02 | Send to Ghana MoMo | Network + phone; success |
| SND-03 | Send to Zambia MoMo | MTN/Airtel/Zamtel; success |
| SND-04 | Insufficient balance | Blocked with clear message |
| SND-05 | Non-live corridor (e.g. KE) with `otherAfricanCorridors` false | Not offered as live / Coming Soon |
| SND-06 | Paytota UGX payout toggle | Appears when `paytotaPayout`; alternate rail works or fails gracefully |
| SND-07 | Plaid bank funding | Link token opens when `plaid`; secrets required |
| SND-08 | Tracking page | Status progresses; failure reason if failed |

**Known blocker:** Nomba upstream JWT expiry can break NGN transfer/conversion while bank lookup still works — document as environment defect, not app UI bug, if APIs return auth errors.

### 6.5 Receive money

| ID | Case | Path / expected |
|----|------|-----------------|
| RCV-01 | In-network receive | Account number / `@efin_tag` shown |
| RCV-02 | Virtual accounts | VA list for supported currencies (NGN, KES, GHS, ZAR, UGX, TZS, ZMW, RWF, USD as implemented) |
| RCV-03 | Zambia MoMo payment links | Create fixed/flexible ZMW link when `elicate`; pay with MoMo; wallet credit |
| RCV-04 | Escrow payment links | `/payment-links` Coming Soon when `paymentLinks` false |

### 6.6 Contacts / payees

Routes: `/contacts`, `/payees`. Modal: Add / Edit Payee.

| Field / control | Required? | Notes |
|-----------------|-----------|-------|
| Category | Yes | person, supplier, employee, contractor, payee, other |
| Country | Yes | Drives payout defaults |
| Full name / business | Yes | |
| Nickname | Optional | |
| Email | Optional | |
| **Phone** | Optional (required if Mobile payout) | Always visible |
| **Mailing address** | Optional | Street, city, state/province, postal |
| Default payout | Optional | None / EFT 🇨🇦 / Interac / Mobile / Bank |
| Notes & tags | Optional | |

| ID | Case | Expected |
|----|------|----------|
| CON-01 | Create person with phone + mailing address | Saved; visible on edit |
| CON-02 | Edit payee | All fields reload including tel & address |
| CON-03 | Mobile payout without phone | Validation error |
| CON-04 | Interac without email | Validation error |
| CON-05 | EFT fields | Institution / transit / account validation |
| CON-06 | Nigeria bank | Bank list + account name resolve |
| CON-07 | Search contacts | Match name, nickname, phone |
| CON-08 | Send from contact | Prefills send flow |

### 6.7 Exchange (FX)

| ID | Case | Expected |
|----|------|----------|
| FX-01 | Exchange NGN → USD (or supported pair) | Quote, fee, success; both wallets update |
| FX-02 | Crypto tab | Hidden / Coming Soon when `crypto` false |

### 6.8 Cards

| ID | Case | Expected |
|----|------|----------|
| CRD-01 | `/cards` with `cards` true | Page loads |
| CRD-02 | Swychr virtual card issue | Issue/ops when `swychr`; needs funded provider wallet |
| CRD-03 | Stripe card funding | Gated (`stripe` false) |

### 6.9 Bills & airtime

| ID | Case | Expected |
|----|------|----------|
| BIL-01 | `/pay-bills` | Categories (airtime, cable, utilities, etc.) via Flutterwave billers when enabled |
| BIL-02 | Validate + pay bill | Success / clear failure |
| BIL-03 | Canada bills | `/pay-bills/canada` |
| AIR-01 | Swychr airtime panel | Catalog + recharge when `swychr` and not Canada-only context |

### 6.10 Transfers history

| ID | Case | Expected |
|----|------|----------|
| HST-01 | List transfers | Newest first; filters if any |
| HST-02 | Open detail | Status, amounts, corridor, reference |
| HST-03 | Failed transfer | Failure reason displayed |

---

## 7. Admin & compliance testing (high level)

Prioritize by role:

| Theme | Examples | Pass criteria |
|-------|----------|---------------|
| AuthZ | Non-admin cannot open `/admin/*` | Redirect / 403 |
| KYC queue | Approve / reject with notes | User status updates; audit |
| Sumsub EDD | Launch from KYC review | Applicant created/status |
| User management | View user wallets / freeze if exists | Actions logged |
| API Management | `/admin/api` probes | Health results; PSP names OK here |
| AML modules | Sanctions, STR, monitoring | Forms save; permissions |

---

## 8. Non-functional & cross-cutting

| Area | Cases |
|------|-------|
| Responsive | Desktop + mobile for Top-up, Send, Contacts, Dashboard |
| Session | Expiry / logout clears access |
| Deep links | Payment callback returns to correct wallet |
| Idempotency | Double-submit top-up/send does not double-credit |
| Webhooks | Manual replay / delayed webhook still credits once |
| Localization | Currency symbols & decimals correct (ZMW, NGN, CAD) |
| Accessibility | Labels on form fields; modal focus trap |
| Security | No secrets in client bundle; no PSP keys in Network response bodies |

---

## 9. Suggested test suites (team split)

### Suite A — Smoke (daily / release)

1. Login + dashboard  
2. NGN Express card top-up (sandbox amount)  
3. GHS MoMo top-up  
4. ZMW MoMo top-up  
5. NGN bank send (small amount)  
6. Create/edit contact with phone + address  
7. FX one pair  
8. Confirm Coming Soon: Canada domestic, payment links, crypto  

### Suite B — CAD / Western top-up

1. CAD method picker labels  
2. CAD via USD charge (Express + Card or bank)  
3. Invoice path  
4. Interac on/off by flag  
5. Fincra USD merchant errors handled  

### Suite C — Zambia / Elicate

1. Top-up OTP  
2. Send MoMo  
3. Receive payment links  
4. Webhook / reconcile credit  

### Suite D — Cards / bills / airtime

1. Cards page + Swychr issue  
2. Bill validate/pay  
3. Airtime catalog/recharge  

### Suite E — Regression / flags

1. Toggle `elicate` / `fincra` / `paytota` / `swychr` off → UI hides  
2. `otherAfricanCorridors` on → KE/UG appear as send  
3. White-label assertions across all top-up methods  

### Suite F — Admin / KYC

1. Persona happy path  
2. Admin approve/reject  
3. Role matrix  

---

## 10. Known limitations & environment risks

1. **`fincraInterac` default false** — Interac CAD top-up not in default builds.  
2. **`canadaDomestic` false** — Canada Interac/EFT send Coming Soon.  
3. **`paymentLinks` false** — Escrow links gated; **ZMW Elicate receive links still live** when `elicate` true.  
4. **Fincra USD = card only** — no bank_transfer for USD charge currency.  
5. **CAD always charged as USD** for card/checkout rails that use Fincra/Nomba international path.  
6. **Fincra merchant config** — “Merchant not enabled to process USD card” is account-side, not card failure.  
7. **Localhost redirect** — Fincra return URL may point to production `VITE_APP_URL`.  
8. **Nomba JWT** — Upstream expired JWT can break payouts while lookups work.  
9. **Swychr cards** — Need funded admin/box wallet; sandbox vs prod via secrets.  
10. **`docs/PRODUCT_RAILS.md` may be stale** — prefer `productFeatures.ts` for what is live.  

---

## 11. Data & evidence for bug reports

Please include:

- Environment URL + build/commit if known  
- User ID / email (test account)  
- Wallet currency & amount  
- Corridor / beneficiary type  
- User-facing method label selected  
- Timestamp (UTC)  
- Screenshots + Network failing request (status, response message)  
- Transfer / payment reference from UI  
- Feature flag assumptions  

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Rail / PSP | Payment service provider powering a method |
| Corridor | Country/currency path for send |
| MoMo | Mobile money |
| VA | Virtual account number for receive |
| KYC / CDD / EDD | Identity & due diligence levels |
| White-label | Hide provider brand; show product method name |
| Edge Function | Supabase serverless API backing a rail |

---

## 13. Document control

| | |
|---|---|
| Prepared for | QA team test-case authoring |
| Related code | `src/lib/productFeatures.ts`, `src/lib/walletTopupGateway.ts`, `src/pages/TopUpPage.tsx`, `src/pages/SendPage.tsx`, `src/components/modals/AddBeneficiaryModal.tsx` |
| Related internal docs | `docs/PRODUCT_RAILS.md`, `docs/swychr/README.md` |
| Update trigger | Any change to feature-flag defaults or live corridors |

---

*End of eFinMoney QA Test Planning Guide*
