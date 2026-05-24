# Pay-with-Card: Better input + processing UX

## Goal
On the Pay with Card form (`src/components/modals/CardPaymentForm.tsx`), let the user input card details in clear, separate fields, and replace the small button spinner with a polished full-form processing state.

## 1. Separate card input fields

Replace the single combined `CardElement` with Stripe's individual Elements so each field is its own labeled input:

- **Card number** (`CardNumberElement`) — with live brand icon (Visa/Mastercard/Amex) on the right
- **Expiry (MM/YY)** (`CardExpiryElement`)
- **CVC** (`CardCvcElement`)
- **Cardholder name** — plain `<Input>` (new), prefilled with the user's profile name, uppercased
- **Postal/ZIP code** — plain `<Input>` (new, optional), passed in `billing_details.address.postal_code` for AVS

Layout (desktop and mobile both work at the modal width):
```text
[ Cardholder name ............................. ]
[ Card number ............................ VISA ]
[ Expiry MM/YY ]        [ CVC ]
[ Postal code ]
```

Each Stripe sub-element keeps the existing theme-aware styling (`buildCardOptions`) so colors still match light/dark mode. Track readiness per field (`numberReady && expiryReady && cvcReady`) before enabling the Pay button.

Validation:
- Disable Pay until all 3 Stripe elements are `complete: true` (listen to each element's `onChange`)
- Require non-empty cardholder name
- Show inline red helper text under any field that emits a Stripe `error.message`

## 2. Processing UX (best-practice overlay)

When the user clicks Pay, show a non-dismissable overlay on top of the form:

- Dim the form behind it (`absolute inset-0 bg-background/80 backdrop-blur-sm`) so the user can't double-submit
- Centered large spinner (`Loader2 h-10 w-10 animate-spin text-primary`)
- Three-stage status text that updates as the flow progresses:
  1. "Authorizing your card…" (during `stripe-payment-intent` create)
  2. "Processing payment…" (during `stripe.confirmCardPayment`)
  3. "Crediting your wallet…" (during confirm step)
- Small `Lock` icon + "Do not close this window" caption below the spinner
- Smooth `animate-fade-in` mount

The existing success state (green check + "Payment successful!") is unchanged.

The submit button itself shows the simple inline spinner only as a fallback for the brief moment before the overlay mounts; the overlay is the primary signal.

## 3. Out of scope
- No backend / edge function changes (`stripe-payment-intent` flow is untouched)
- No new "save card" checkbox — that lives in the separate `SaveCardForm`
- No changes to the African/Flutterwave path in `TopUpModal`

## Technical notes
- Imports change to `CardNumberElement, CardExpiryElement, CardCvcElement` from `@stripe/react-stripe-js`
- Need `useProfile` to prefill cardholder name (already used in `SaveCardForm.tsx` — same pattern)
- Add a `processingStage` state (`'auth' | 'charge' | 'credit' | null`) to drive the overlay copy
- Files touched: only `src/components/modals/CardPaymentForm.tsx`
