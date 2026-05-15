# Fix Stripe debit-card tokenization error

## Problem

The "Send via Debit Card" step throws:

> Invalid value for token type… You specified: card.

Our code calls `stripe.createToken('card', { number, exp_month, … })` with raw card data. Stripe.js does **not** allow that — raw PAN handling is PCI-restricted. Tokens of type `card` can only be created from a **Stripe Elements** field where Stripe (not our JS) reads the digits inside an iframe.

## Fix

Replace the three raw `<Input>` fields (card number, expiry, CVC) on the Canada send flow with Stripe Elements. The recipient name and email stay as plain inputs.

### Changes

1. **`src/lib/stripePayouts.ts`** — rewrite `tokenizeDebitCard` to accept a Stripe `CardNumberElement` instance plus `{ name, currency }` and call `stripe.createToken(cardNumberElement, { name, currency: 'cad' })`. Remove the `DebitCardInput` raw-data shape.

2. **`src/components/send/CanadaSendFlow.tsx`**
   - Wrap the component (or just step 2 when `method === 'card_push'`) in `<Elements stripe={getStripe()}>` from `@stripe/react-stripe-js`.
   - Replace the three card `<Input>` fields with `<CardNumberElement>`, `<CardExpiryElement>`, `<CardCvcElement>` styled to match our dark theme via the Elements `options.style` prop (use HSL tokens read from CSS vars to stay on-brand).
   - Drop `cardNumber / cardExpMonth / cardExpYear / cardCvc` state. Track readiness with `cardComplete` booleans from each element's `onChange`.
   - In `handleSubmit`, get the `CardNumberElement` via `useElements().getElement(CardNumberElement)` and pass it to the new `tokenizeDebitCard(element, { name: recipientName, currency: 'cad' })`.
   - Update `isStep2Valid` for `card_push` to require: name + all three elements `complete`.

3. **No backend changes.** `stripe-payout` already accepts a token (`tok_xxx`) as the external account — that contract is unchanged.

### Visual / UX

- Card fields render in the same rounded input style. We pass Stripe Elements a `style` object using `--foreground`, `--muted-foreground`, `--destructive` resolved at runtime so they match light/dark theme.
- The "Canadian debit card only" helper text and three-column expiry/CVC grid stay.
- Same submit button label and summary box.

### Out of scope

- Saving cards for repeat sends.
- Switching the inline three-field layout for a single combined `<CardElement>` — keeping three separate elements per existing UX.
- Any change to Paysafe (Interac/EFT) paths.

## Files touched

- `src/lib/stripePayouts.ts` — rewrite tokenize helper
- `src/components/send/CanadaSendFlow.tsx` — Elements wrapper + new card fields + submit wiring
