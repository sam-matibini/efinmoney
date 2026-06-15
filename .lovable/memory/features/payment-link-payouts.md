---
name: Payment Link Payouts
description: Send + Invoices payment links with escrow, claim by Interac/EFT/Debit card (Visa Direct)
type: feature
---
Payment links: created in /send + invoices, funds escrowed at 2199 on creation, single-use, 7-day expiry.

Claim methods:
- Interac e-Transfer (Paysafe)
- EFT (Paysafe)
- Debit card via Stripe Visa Direct (CAD only)

**Debit card claim requires inline KYC** on ClaimPaymentLinkPage: full name, email, DOB, phone, address (line1/city/province/postal), and ToS acceptance. The edge function `payment-link-claim` seeds a Stripe Custom Connect account with these fields + `tos_acceptance` (recipient service agreement) and polls up to 6s for the `transfers` capability to activate before calling `payouts.create({ method: "instant" })`. Without these fields, Stripe returns "requirements need to be collected" and the payout fails.

Ledger release on success: DR 2199 / CR 1108. Rollback restores escrow on any failure.

UI status surfacing: escrow journal stays DR 2101 / CR 2199 forever; claim posts a separate release journal DR 2199 / CR 1108. `TransactionDetailPage` parses `[CODE]` from the description and renders a Paid/Pending/Expired banner sourced from `payment_link_payouts.status`, with a cross-link to the counterpart journal. `PaymentLinksPage` labels claimed rows as "Paid" (DB value stays `claimed`) and auto-expires stale pending rows on load.

