# Interac checkout, Fairstone/ZUM-style — automated via Wise

## What the reference does

The Fairstone (ZUM) screens show a two-pane hosted checkout:

- Left pane: static invoice/summary — to, from, comment, invoice ID, date, big amount, line items.
- Right pane: a method picker (Interac, Visa Direct) with icon + one-line description + arrow.
- Choosing Interac swaps the pane for a single payer form (account type, phone, first/last name, e-mail, billing address, province, postal code, country) and one `Pay $550.00 CAD` button.
- Bilingual EN/FR toggle, "Powered by" footer.

The user never sees a reference number, never opens their banking app manually, and never clicks "I've sent the payment".

## What we have today

Our current Interac card (screenshot) is a manual push: alias, `EFM-…` reference, copy buttons, bullet instructions, an "I've sent the payment" button, then polling. Functionally correct, but the user does the work.

## Important constraint

Interac e-Transfer is a **push** rail and Wise exposes no API to pull funds from a payer's bank. So "automated" here means: automate everything except the payer's tap inside their own banking app, and make that tap one click instead of a copy/paste checklist. The plan below is honest about this: the reference/alias never appears as a to-do list; it is embedded in a prefilled hand-off, and confirmation is fully automatic.

## What we will build

### 1. Hosted checkout shell (new)
A two-pane `CheckoutShell` matching the reference layout:
- Left: order summary (payee name, amount, reference/invoice id, description, line item).
- Right: `CheckoutMethodGrid` restyled as the reference rows — icon circle, title, subtitle, chevron.
- Header with a Back arrow and an EN/FR toggle; footer "Payments powered by eFinMoney".
- Reused by wallet top-up, send-flow funding, and merchant payment links so all three look identical.

### 2. Single payer form + one Pay button
Replace the identity step with the reference's form:
- Account type (Personal/Business), phone, first name, last name, e-mail.
- Billing address block (line 1, line 2, city, province, postal code, country=Canada), prefilled from the user's profile when signed in.
- One primary button: `Pay CAD X.XX`. No second step, no copy buttons on this screen.

### 3. Automated hand-off after Pay
Pressing Pay creates the intent server-side and immediately hands off, in this order:
1. **Wise-hosted payment request** — if the Wise account exposes a request-money/payment-link option, `fincra-cad-interac` creates it and we redirect/open it, so the payer pays on a Wise page (closest match to the reference). Detected at runtime; no config guessing.
2. **Prefilled e-Transfer hand-off** — otherwise we open the payer's banking app / mail client with amount, recipient alias and reference already populated (mobile deep link, desktop `mailto:`-style hand-off plus a one-tap "Copy payment details" fallback tucked behind a link, not a checklist).

Then the screen goes straight to a Square-style status view: spinner → "Payment received" → receipt, with no manual confirm button. The existing "I've sent the payment" action becomes an invisible auto-claim fired at hand-off, and only surfaces as a small link if nothing has arrived after a few minutes.

### 4. Confirmation stays automatic
No change to the matching engine: `wise-webhook` tiered reconciliation (reference+amount, amount+contact, unique amount in window) already credits the wallet and releases the linked payout. We only add the intent's payer form fields (account type, phone, address) so Tier 2 contact matching has more to work with, and store them on the intent for compliance/receipts.

## Technical notes

- New: `src/components/payments/CheckoutShell.tsx`, `InteracPayerForm.tsx`, `InteracStatusView.tsx`; `InteracCheckout.tsx` becomes a thin orchestrator (form → hand-off → status).
- `CheckoutMethodGrid.tsx` / `InteracMethodCard.tsx` restyled to the reference rows using semantic tokens only.
- `fincra-cad-interac`: extend `create` to accept the payer fields, attempt a Wise payment-request/link and return `hosted_url` when available, and auto-set `claimed_sent_at` on hand-off.
- Migration: add payer columns (account type, phone, address lines, city, region, postal code, country) to `fincra_cad_interac_intents`, with grants for `authenticated` + `service_role`.
- EN/FR strings kept in a local dictionary for these components only — no app-wide i18n framework.
- Card/Visa Direct row stays wired to the existing card checkout; no changes to card processing.
