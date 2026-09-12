# Welcome to your Lovable project

## eFinMoney pricing

Cost-recovery pricing and the competitive CAD rate card live in
[docs/pricing-cost-recovery.md](docs/pricing-cost-recovery.md).

- Admin: **Settings → Pricing & Fees** (`/admin/pricing?tab=pricing-rates`)
- Rates rebuild from integrated partners, corridors, FX and currencies
- Correct any cell in the workbook, then **Save corrections**
- Excel: `public/docs/eFinMoney-Rates-and-Pricing-Summary.xlsx` or `npm run export:rate-card`
- Engine checks: `npm run test:pricing`

## Verto corporate clearing

Verto is the rail for corporate flow of funds between eFinMoney and payment partners
([docs.verto.co](https://docs.verto.co/)): wallet FX, V-Pay (`WALLET_TO_BUSINESS`), and
bank payouts (`WALLET_PAYOUT`).

- Admin: **Finance → Verto clearing** (`/admin/verto`) or **Finance → Treasury → Verto clearing**
- Map each partner's Verto company ID (V-Pay) or approved beneficiary ID on the partner sheet
- Secrets: `VERTO_CLIENT_ID`, `VERTO_API_KEY`, optional `VERTO_ENV=sandbox|production`, `VERTO_COMPANY_ID`, `VERTO_PURPOSE_ID`, `VERTO_WEBHOOK_SECRET`
- Without secrets the desk runs in mock mode so ops can rehearse the flow
- SQL: `supabase/migrations/20260911210000_verto_corporate_clearing.sql`

## Fincra CAD Interac e-Transfer

Send checkout and CAD wallet collections take Interac Autodeposit through Fincra.

- Pay-with **Interac** on Send (CAD) and **Interac e-Transfer** on CAD top-up
- Deposit email: `support.cad.live-015@fincra.ca` (`FINCRA_CAD_INTERAC_ALIAS`)
- Payment code: unique `EFM-YYYYMMDD-…` reference from `next_interac_public_id` — paste it in the Interac message
- After sending, the customer enters the bank Interac reference (e.g. `CAh9ECkx`) and taps **Complete** — checkout closes onto the transfer success report
- Edge function: `fincra-cad-interac` (`action: complete` or `action: reconcile_rfi`); webhook: `fincra-webhook` (`collection.successful`, `collection.additional-info-requested`)
- **Instant CAD wallet settlement:** Interac Autodeposit can land at Fincra and then sit pending an RFI (source of funds, purpose, frequency, relationship). The webhook answers those RFIs immediately via `PATCH /collections/{id}/additional-information` so funds credit the eFinMoney Fincra CAD wallet instead of waiting on the merchant email. Completing checkout also reconciles pending CAD collections. To unstick a held collection: `fincra-cad-interac` `{ "action": "reconcile_rfi", "collection_id": "36608277" }`. Check: `npm run test:fincra-rfi`. Redeploy: `fincra-webhook`, `fincra-cad-interac`.
- Secrets: `FINCRA_SECRET_KEY`, `FINCRA_BUSINESS_ID`, `FINCRA_CAD_INTERAC_ALIAS`, optional `FINCRA_CAD_VIRTUAL_ACCOUNT_ID`
- SQL: `supabase/migrations/20260911220000_fincra_interac_complete_status.sql`

**CAD Interac payout (Canadian recipients):** email and mobile are each optional, but at least one is required. The APIs refuse collection (card charge, wallet debit, Interac pay-in) until a valid destination is on the transfer. **Canadian profiles** store a dedicated Interac Autodeposit email (`profiles.interac_email`) separate from the login email — Nomba Checkout never uses the Interac mailbox or `@efin.money` as `customerEmail` (Nomba returns “The provided email is blocked”); it uses the payer’s personal login or `payer.{id}@efinsuite.com`. Nomba Interac payouts reject eFinMoney login addresses (`@efin.money`). Apply `supabase/migrations/20260912124500_profile_interac_email_schema_cache.sql` in the Supabase SQL editor (or `supabase db push`) so PostgREST reloads the schema cache — without that, Profile Settings save fails with “Could not find the 'interac_email' column of 'profiles' in the schema cache”. The app still saves billing without that column and keeps Interac on auth `user_metadata` until the SQL is applied. Also in `supabase/production-sql.sql` section 7. Redeploy: `nomba-collection`, `nomba-payout`. **CAD rails:** Nomba Checkout for cards; Fincra Autodeposit for Interac pay-in (`fincra-cad-interac`); Nomba Global Payout for Interac/EFT send. Paysafe and Flovide are not used for CAD collect or CAD payout. If Nomba fails after the wallet is debited, the transfer stays `funded` / `pending_ops` and `execute-transfer` / `treasury-worker` can resume. Redeploy: `execute-transfer`, `treasury-worker`, `nomba-payout`, `payment-link-claim`, `flovide-payout`, `paysafe-payout`. Check: `npm run test:cad-interac`, `npm run test:nomba-email`, and `npm run test:cad-rails`.

## Nomba / Fincra payout corridors (availability + least cost)

Send is live to every destination Nomba or Fincra can pay: **Uganda (CAD→UGX)**, Tanzania, Rwanda, Ghana, Kenya, Nigeria, Zambia (Fincra only), West/Central Africa XOF/XAF, Ethiopia, DR Congo, South Africa, UAE, UK, eurozone, US, and Canada CAD.

Payout rule: among **available** rails, try the **lowest total cost** first, then fail over. Nomba and Fincra compete on those corridors. **Canada CAD payout stays Nomba Interac/EFT** (never Fincra payout, never M-Pesa). Zambia stays Fincra (Nomba has no ZMW).

SQL: `supabase/migrations/20260912180000_activate_nomba_fincra_corridors.sql`. Redeploy: `execute-transfer`, `nomba-payout`, `fincra-payout`. Check: `npm run test:nomba-fincra`.

## Bank tab: Plaid, Fincra, Verto, Nomba

The Bank account page (`/wallet/receive`) lists company or personal linked banks.

- **Connect with Plaid** — Instant Auth for **Canada and the US**. After linking, eFinMoney stores EFT (CA) or ACH routing (US) numbers, caches live **available** / **current** balances, and can fund CAD wallet top-ups plus same-company bank-to-bank moves without a pre-funded wallet.
- **Partner rails (business)** — Live disbursement balances from **Fincra**, **Verto**, and **Nomba**. Withdraw and same-company sends to linked Nigerian, Ghanaian, or Kenyan banks pay from the Fincra or Nomba partner wallet (NUBAN / bank-to-bank). You do not need a pre-funded eFinMoney wallet when that float covers the amount. Verto is shown for treasury; NUBAN payouts use Fincra then Nomba.
- **Bank transfer checkout** — Top up NGN/GHS from your bank app (`/wallet/topup?method=bank_checkout`), send to a recipient with **Pay with Bank** on Send (collect then payout), or move between company banks on this page. Fincra hosted `bank_transfer` for NGN; optional permanent receive account as a fallback.
- **Top up wallet** — Send from the linked bank to the matching eFinMoney wallet (Loop Interac/EFT for CAD Plaid, Wise ACH details for USD, bank checkout / virtual account for NGN/GHS).
- **Send to another bank** — When the source is a Plaid Canadian bank, we debit that bank (Loop pay-in) and pay the destination once the deposit matches. Africa corridors use partner rails, then the eFinMoney wallet.
- **Link bank** — manual corridor details (NG/GH/KE) or country-specific fields.
- Manual Nigerian / Ghanaian / Kenyan links cannot be **debited** by Plaid. Those banks are **paid** from Fincra/Nomba float (or a funded wallet).

Edge functions (deploy separately from GitHub): `plaid-create-link-token`, `plaid-exchange-token`, `plaid-refresh-balances`, `intra-ca-transfer-create`, `partner-rail-balances`, `linked-bank-rail-payout`. Secrets: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `FINCRA_SECRET_KEY`, `FINCRA_BUSINESS_ID`, `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID`, `VERTO_CLIENT_ID`, `VERTO_API_KEY`. SQL: `supabase/migrations/20260912030000_plaid_account_balances.sql`.

## KYC and KYB

Personal identity can be verified with **Persona**, **Interac** (Canadian bank sign-in), or an optional **manual document review** (government ID + live selfie). Manual submissions land in Admin → KYC with provider `manual` and status `pending_review`.

**Business accounts skip personal KYC.** After signup they go to **KYB** (`/onboarding/business/…`): company details, ownership (including owner ID and selfie), and documents. Compliance reviews the pack — not Persona or Interac. Typical turnaround is 1–2 business days. Admin → KYB.

If a jurisdiction has no seeded document list, a standard pack is used.

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
