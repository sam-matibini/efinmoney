# Recipient auto-fill on the deployed app

## What I verified

I ran the live /send flow in a test browser against the current code and picked the saved contact Patrick Matibini. Everything auto-filled correctly:

- Destination switched to Zambia (ZMW)
- Recipient name: Patrick Matibini
- Mobile money network: Airtel Money selected
- Mobile money number: +260770069550
- Confirmation line: "Contact selected — Patrick Matibini · Airtel Money · +260770069550"

So the prefill logic in the current code is working. The deployed (published) site is serving an older build from before the prefill work, which is why selecting a recipient there fills nothing.

## What to do

1. Republish the app so the published site picks up the current build. This alone resolves the reported behaviour.
2. Small hardening while we are there, so a stale or partial contact record can never silently fill nothing:
   - Fall back to matching the mobile money network from `payout_method` alone when `network` is empty (e.g. a contact saved only with `mtn_mobile`).
   - Keep the prefill retry alive when the destination country list has not resolved yet, instead of dropping it after the first pass.
   - Show a short "Couldn't prefill payout details" hint under the contact line when a contact is selected but no payout field could be filled, so the failure is visible instead of silent.

## Technical notes

- `src/pages/SendPage.tsx`: the prefill effect around lines 1298-1377 already covers name, phone, email, NGN/GHS bank and mobile money network. Change 2a adjusts the network match to also run when `b.network` is null but `b.payout_method` is set; 2b keeps `pendingBeneficiary` set while `findCountryByCode(b.country_code)` returns nothing yet; 2c extends `prefillSummary` to return a fallback message.
- No backend or schema changes.

## Verification

Re-run the contact-select flow for a mobile money contact (Zambia/Airtel) and a bank contact (Nigeria), then publish and confirm the same on the live site.
