# One-page wallet top-up with every payment method

## Problem

Today the Add Money flow has two issues:

1. It is split into two steps — Amount, then Pay — so you never see the payment options while choosing the amount.
2. Only **one** provider is offered. The page auto-picks a single gateway for the wallet currency (Flutterwave, or Paytota, or Wise, or Interac, etc.) and shows only that provider's methods. Everything else eligible for the same currency is hidden.

## What changes

**Single form.** Wallet, amount, and payment methods all live on one page. No "Continue" step, no step indicator. The order summary (amount, provider fees, total) stays visible next to the methods and updates live as the amount is typed.

**All eligible methods listed together.** Instead of one auto-picked gateway, the page lists every rail available for the selected wallet currency, grouped by the coloured Card / Bank / Mobile / Wallet row already used elsewhere. For example a CAD wallet will show Card, Interac e-Transfer, Bank transfer (Wise), and hosted invoice checkout together; a KES wallet will show Mobile money (Swychr / Paytota / Flutterwave), Card, and Bank transfer.

Selecting a category filters the list; selecting a row expands that provider's own checkout form inline, exactly as it does now.

**Ordering and labelling.** Within each category the rails are ordered by the existing priority pickers, so the recommended rail sits first and is preselected. Each row shows the provider name as its subtitle ("Powered by Wise", "Powered by Paytota") so duplicate labels stay distinguishable. Rails that are configured but not live for that currency are not shown.

**Amount rules.** The per-currency minimum and validation stay. Method forms stay disabled until a valid amount is entered, with an inline hint rather than a blocking step.

## Technical notes

- `src/pages/TopUpPage.tsx`
  - Replace the single `gateway` branch that builds `payMethods` with a builder that iterates `availableIntlMethods(currency)` and `availableAfricaMomoMethods(currency)` and emits one `CheckoutMethod` per eligible rail (flutterwave momo, flutterwave hosted, swychr, paytota, dodo, nomba, lenhub, interac, wise, ghana, elicate, fincra hosted).
  - The existing `routeWalletTopupGateway` result becomes the *default selected* method rather than the only one; deep links (`?provider=`) still preselect.
  - Fincra hosted checkout becomes a method row with its own "Continue to checkout" button instead of the special-cased step-1 submit.
  - Drop `topupStep` / `needsPayStep` / `flowSteps`; render `CheckoutShell` always, with the wallet picker and amount input in its left column above `PaymentMethodRow` + `CheckoutMethodList`.
  - Add a `provider` sublabel and explicit `tone` to each method entry so `toneForMethod`'s string sniffing is no longer needed.
- No changes to edge functions, pricing, or ledger behaviour — this is presentation and rail-eligibility surfacing only.
