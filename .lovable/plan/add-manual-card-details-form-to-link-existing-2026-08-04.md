# Add manual card-details form to "Link existing"

The "Link existing" tab of Add New Card currently renders only the message "Card payments via Stripe are no longer available" — Stripe is switched off platform-wide (`STRIPE_PAYMENTS_ENABLED = false`), so there are no input fields at all. The Quick add card row in the Send checkout opens this same tab, so there is no way to add a card today.

## What changes

A real card form appears in the "Link existing" tab with:

- Cardholder name
- Card number (auto-spaced, brand detected from the number: Visa / Mastercard / Amex / Discover, with Luhn check)
- Expiry MM/YY
- CVV
- Billing postal code (optional)
- Charge currency (defaults to CAD)
- "Set as default card" toggle
- A "Save Card" button at the end of the form

On save, the card appears immediately in My Cards and in the Send / Top-up card picker as a selectable funding source.

## Card security

The full card number and CVV are never stored. Saving records only the brand, last 4 digits, expiry, cardholder name, currency and country — the standard display record. When that saved card is used to pay on the card rail, the checkout prefills name and expiry and asks for the number and CVV at the moment of payment, which is handed straight to the payment processor.

## Technical details

New `src/components/cards/ManualCardForm.tsx`
- Zod schema: name (1-50, trimmed), number (13-19 digits, Luhn valid), expiry (MM/YY, not past), cvv (3-4 digits), postal (optional, max 12), currency (3-letter).
- Brand detection + formatting reuse `src/lib/cardBrand.ts`.
- Inserts into `saved_payment_methods` with `user_id`, `card_brand`, `last_four`, `exp_month`, `exp_year`, `cardholder_name`, `currency_code`, `country_code`, `is_default`, and `stripe_customer_id`/`stripe_payment_method_id` set to `manual` / `manual_<uuid>` sentinels (both columns are NOT NULL). No PAN or CVV is written or logged.
- If "set as default" is checked, clear `is_default` on the user's other rows first (an `enforce_single_default_saved_card` trigger already exists; the client update keeps the cache consistent).
- Invalidates the `["saved-cards", user.id]` query, toasts success, calls `onSuccess`.

`src/components/modals/AddCardModal.tsx`
- Render `ManualCardForm` in the `link` tab when `STRIPE_PAYMENTS_ENABLED` is false; keep `SaveCardForm` for when Stripe is re-enabled.

`src/components/send/MethodCheckoutPanel.tsx` — unchanged; the newly saved card flows through `useSavedCards` into the existing picker.

No schema changes or edge functions needed.
