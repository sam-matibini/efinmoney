# Stripe Card Vault + Saved-Card Funding

Add proper Stripe-tokenized card storage so users can save cards once on the Cards page and reuse them to fund Send Money transfers (Stripe charge → wallet credit → Flutterwave payout).

## 1. Database

New migration:

- `profiles.stripe_customer_id text` (nullable, unique).
- New table `saved_payment_methods`:
  - `id uuid pk`, `user_id uuid not null`, `stripe_customer_id text not null`,
    `stripe_payment_method_id text not null unique`, `card_brand text`,
    `last_four text`, `exp_month int`, `exp_year int`,
    `cardholder_name text`, `is_default bool default false`,
    `created_at timestamptz default now()`.
- RLS: user can `select/insert/update/delete` own rows; admin can read all.
- Trigger: when `is_default=true`, unset others for same user.

## 2. Edge functions (new)

### `stripe-save-card`
- Auth required. Validates JWT, gets `user_id`.
- Loads profile; if no `stripe_customer_id`, creates Stripe Customer (email + name) and stores it.
- Creates SetupIntent (`payment_method_types: ['card']`, `usage: 'off_session'`, `customer: stripe_customer_id`).
- Returns `{ client_secret, customer_id, publishable_key }`.

### `stripe-save-card-confirm` (companion)
- After frontend confirms SetupIntent, frontend calls this with `setup_intent_id`.
- Server retrieves SetupIntent, expands `payment_method`, validates ownership, inserts row in `saved_payment_methods` with brand/last4/exp/cardholder.
- Optionally sets `is_default=true` if first card.

### `stripe-charge-saved-card`
- Body: `{ payment_method_id, amount, currency, transfer_id?, wallet_id?, purpose: 'wallet_topup' | 'transfer_funding' }`.
- Validates the `saved_payment_methods` row belongs to caller.
- Creates PaymentIntent: `customer`, `payment_method`, `amount`, `currency`,
  `confirm: true`, `off_session: true`, `automatic_payment_methods.enabled: true (allow_redirects: 'never')`.
- On `succeeded`: posts double-entry ledger credit to caller's wallet of that currency
  (DR `1101 Bank Trust - <ccy>`, CR `2101 Customer Wallet Liability - <ccy>`),
  reference_type `stripe_card_charge`, journal id = PI id.
- Returns `{ status, payment_intent_id, ledger_journal_id }` or `{ error, code }`.

## 3. Frontend — Cards page "Link existing" tab

Replace current manual PAN/CVV inputs with Stripe Elements:

- Wrap form in `<Elements stripe={stripePromise}>` (publishable key fetched via existing `getStripe()`).
- Form: cardholder name + `<CardElement>` styled to dark theme (semantic tokens: foreground/muted-foreground/border, font Inter).
- On submit:
  1. Call `stripe-save-card` → get `client_secret`.
  2. `stripe.confirmCardSetup(client_secret, { payment_method: { card, billing_details: { name } } })`.
  3. Call `stripe-save-card-confirm` with `setupIntent.id`.
  4. Invalidate `saved-cards` query, toast success, close.
- Drop the `cards` table insert path for "external" cards — those now live in `saved_payment_methods`.

The internal-issued (virtual/physical) flow in `useCards` stays as-is; only the "Link existing" external path moves to Stripe.

New hook `useSavedCards()` reading `saved_payment_methods`.

Cards page carousel: render virtual/physical from `cards` table + saved Stripe cards from `saved_payment_methods` (brand, `•••• last_four`, `MM/YY`). Saved cards show a "Fund wallet" action that opens the new charge modal.

## 4. Frontend — Send Money card funding

In `SendPage` / `CanadaSendFlow` card-funding option:

- Replace the Flutterwave hosted-link redirect with a saved-card picker.
- Query `useSavedCards()`:
  - **0 cards** → empty state: "Add a card first" + button → `/cards?tab=link`.
  - **≥1** → vertical list of selectable cards (Apple-Pay style: brand logo, `•••• 4242`, `12/27`), default preselected.
- Confirm button calls `stripe-charge-saved-card` with `{ payment_method_id, amount: total_cost_in_source_currency, currency: source_currency, purpose: 'transfer_funding', transfer_id }`.
- On success → existing transfer pipeline runs `execute-transfer` (Flutterwave payout) — wallet now has the credit, so the existing balance check passes.

## 5. Stripe lib updates

`src/lib/stripe.ts`: keep `getStripe()`. Add small helper `useStripeElements()` wrapper (or just import `<Elements>` directly in the form). Card element style object pulled from CSS variables at mount.

## 6. Secrets

`STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` already exist — no new secrets needed.

## 7. Out of scope

- Webhooks for async card charges (off_session 3DS) — handled later; for now we surface `requires_action` as a toast asking the user to retry from Cards page.
- Refunds / removing cards from Stripe (delete row + detach PM is a future polish).

## Files touched

- `supabase/migrations/<new>.sql`
- `supabase/functions/stripe-save-card/index.ts` (new)
- `supabase/functions/stripe-save-card-confirm/index.ts` (new)
- `supabase/functions/stripe-charge-saved-card/index.ts` (new)
- `src/components/modals/AddCardModal.tsx` (Link-existing tab → Stripe Elements)
- `src/hooks/useSavedCards.tsx` (new)
- `src/components/cards/CardStack.tsx` / `src/pages/CardsPage.tsx` (render saved cards)
- `src/components/send/CanadaSendFlow.tsx` + `src/pages/SendPage.tsx` (saved-card picker)
- `src/lib/stripe.ts` (Elements helper)
