
## Goal
Fix the "Cannot create payouts: this account has requirements that need to be collected" error when a recipient claims a Payment Link by Debit card. Stripe's Custom Connect account currently has zero KYC info, so the `transfers` capability stays inactive and `payouts.create` fails.

## Approach
Collect the minimum information Stripe needs on the existing claim form and pass it to `payment-link-claim` to seed the Custom account at creation time, plus `tos_acceptance`. No redirect, single page UX preserved.

## UX changes — `src/pages/ClaimPaymentLinkPage.tsx`
When **Debit card** tile is selected, add a "Verify it's you" section above the card fields:
- Date of birth (Day / Month / Year — three small selects)
- Phone number (CA format)
- Street address line 1
- City
- Province (select: ON, QC, BC, AB, …)
- Postal code (uppercased, A1A 1A1 pattern)
- Checkbox: "I agree to Stripe's Services Agreement and the eFinMoney Terms" (must be checked)

`isValid` for `card_push` becomes: name ≥ 2, email valid, all KYC fields filled, postal code matches `^[A-Z]\d[A-Z] ?\d[A-Z]\d$`, DOB ≥ 18 years old, ToS checked, Stripe card element complete.

On submit, send the new fields under `payload.kyc`:
```ts
payload: {
  card_token, card_last4, card_brand,
  kyc: { dob: { day, month, year }, phone, address: { line1, city, state, postal_code, country: "CA" } },
  tos: { accepted: true }
}
```

## Edge function changes — `supabase/functions/payment-link-claim/index.ts`
1. **Validate** the new payload with zod (or manual checks) when `method === "card_push"`. On failure: rollback + 400.
2. **Seed Custom account** with the collected data:
   ```ts
   stripe.accounts.create({
     type: "custom",
     country: "CA",
     business_type: "individual",
     capabilities: { transfers: { requested: true } }, // card_payments not needed for OCT
     individual: {
       first_name, last_name, email,
       phone: kyc.phone,
       dob: { day, month, year },
       address: { line1, city, state, postal_code, country: "CA" }
     },
     business_profile: { mcc: "6012", product_description: "Personal payment received via eFinMoney payment link", url: "https://efin.money" },
     tos_acceptance: { date: Math.floor(Date.now()/1000), ip: claimedIp, service_agreement: "recipient" },
     metadata: { payment_link_code: code, sender_id: claimed.sender_id }
   })
   ```
3. **Wait briefly for capability activation** — after `createExternalAccount`, retrieve the account and poll up to ~6 s for `capabilities.transfers === "active"`. If still inactive, retrieve `requirements.currently_due` and return a clean, human-readable error listing the missing fields; rollback escrow so funds stay safe.
4. **Payout call** unchanged: `stripe.payouts.create({ amount, currency:"cad", method:"instant", destination: ext.id }, { stripeAccount: acct.id })`.
5. **Error mapping**: if Stripe returns a card-validation error (`card_declined`, `invalid_card_type`, non-CA debit), rollback and surface a friendly message ("This card can't receive instant payouts. Please try a different Canadian Visa Debit or Debit Mastercard.").

## Why this works
Stripe activates the `transfers` capability synchronously for CA individuals once DOB + address + phone + ToS are present and the card is a CA debit. Once active, the OCT payout succeeds in seconds. No webhook wait, no second page, no extra secrets.

## Files touched
- `src/pages/ClaimPaymentLinkPage.tsx` — KYC form section, payload extension, validation rules
- `supabase/functions/payment-link-claim/index.ts` — accept KYC, seed account, poll capability, map errors
- `mem://features/payment-link-payouts.md` — note the inline-KYC requirement for card_push

No DB migration, no new secrets.
