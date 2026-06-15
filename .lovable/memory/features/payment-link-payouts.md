---
name: Payment Link Payouts
description: Sender-generated claim links (/claim/:code) for sending CAD without recipient details upfront; funds escrowed in 2199 Payouts Pending Claim
type: feature
---

Payment Link is the 5th delivery method on /send?mode=canada (CanadaSendFlow.tsx). Sender picks amount + optional recipient name/note; on confirm, edge fn `payment-link-create` escrows funds DR wallet liability (21xx) / CR `2199 Payouts Pending Claim` and returns a 7-day single-use link `<origin>/claim/<code>`.

Recipient opens `/claim/:code` (public route, ClaimPaymentLinkPage), picks Interac / EFT / Card Push (card_push placeholder for v1), submits → `payment-link-claim` releases escrow DR 2199 / CR 1108 settlement, creates a completed transfer row, marks the link claimed.

`payment-link-revoke` reverses escrow if still pending. `payment-link-resolve` is the public lookup powering the claim page.

Table: `payment_link_payouts` (RLS: sender + admin). COA accounts `2199` exist for CAD/USD/EUR/GBP.
