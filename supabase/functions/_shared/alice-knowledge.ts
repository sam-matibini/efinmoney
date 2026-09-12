// Curated EfinMoney product knowledge for the Alice AI assistant.
// Keep this factual and up to date. Alice must NOT invent fees, limits, or
// numbers that are not here or returned by a tool — it should defer to the
// relevant page or support instead.

export const EFINMONEY_KNOWLEDGE = `
# About EfinMoney
EfinMoney (eFin Money) is a licensed multi-currency money-services platform (MSB)
for cross-border payments, focused on corridors between Canada, Nigeria, Zambia
and other African markets. It operates under RPAA and FINTRAC compliance.

# Core features
- **Multi-currency wallets**: users hold balances in several currencies (e.g. USD,
  CAD, NGN, GBP, ZMW, KES, UGX, TZS, GHS, RWF, EUR). Each currency is a separate wallet.
- **Send money / transfers**: send to recipients locally and cross-border. Payout
  methods include mobile money (e.g. MTN, Airtel) and bank/account payout, depending
  on the destination country.
- **Top-up (add money)**: fund wallets via card and local rails. Providers include
  Stripe and Adyen (cards), Flutterwave (USD/CAD and African methods), and Paysafe
  (Interac e-Transfer and EFT in Canada).
- **FX exchange**: convert between your own wallets at the app's live rate.
- **Cards**: virtual cards (Stripe Issuing) for spending balances.
- **Crypto**: stablecoin/crypto rails (Stellar, USDC, Circle CPN) for supported flows.
- **Payment links**: request money by sharing a link; funds are held in escrow until claimed.
- **Bill payments**: pay bills/billers in supported countries.

# KYC / verification
- Personal accounts: KYC tiers run from tier_0 (unverified) to tier_3 (fully verified); higher tiers
  unlock higher limits and more features. Verification is Persona, Interac, or a manual document upload.
- **Business accounts do not complete personal KYC.** They complete KYB (company details, ownership, documents).
  Do not tell a business user to finish KYC. If their KYB is approved they can issue receive accounts and send.
- KYC statuses a personal user may see: pending, submitted / pending_review, verified, rejected, expired.

# How-to pointers (direct users to these)
- Send money: the "Send" page.
- Add money: the "Top up" / wallet funding page.
- Convert currency: the FX / exchange action in the wallet.
- Cards: the "Cards" page.
- Check status of a transfer: the wallet statement / activity.
- Finish or fix verification: the onboarding / identity flow.

# Boundaries
- Exact fees, FX spreads, and per-tier limits vary by corridor and are not all listed
  here — if you are not certain of a figure, do NOT guess; tell the user where to see
  it (the relevant page) or to contact support.
- You cannot perform actions (send money, convert, approve KYC, change settings).
  When asked to DO something, explain that you can't act yet and point to the right
  page, or to support for account changes.
`;

// Extra context available only to admin/staff users.
export const EFINMONEY_ADMIN_KNOWLEDGE = `
# Admin / operations context
The admin portal covers: KYC review queue, Users, Staff, Board & compliance dashboards,
AML program (CDD/EDD, sanctions, PEP, beneficial ownership), transaction monitoring,
regulatory reporting (STR/SAR, LCTR, EFTR, wire transfers, travel rule), correspondent
banking, geographic risk, settlement reconciliation, period-end controls, evidence
repository, training, and the auditor portal.
Two role systems exist: admin_users (portal) and user_roles/app_roles (database RLS);
they are kept in sync so a super_admin maps to admin+compliance+finance app_roles.
`;
