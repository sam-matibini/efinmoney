# Preload recipient payment details on contact select

When a saved contact is picked (dropdown, "All contacts" picker, or just-added contact), the Send form should fill every payout field that contact already has — phone/mobile money number, network, bank + account, or Canadian EFT/Interac details — so nothing is retyped.

Today the form fills the name and destination country reliably, but the mobile money number and network often stay empty/default (as in the screenshot: Patrick Matibini is stored with +260770069550 on Airtel, yet the number box is blank and MTN is highlighted). The current prefill runs as a one-shot effect that can clear itself before the destination country and network list settle.

## What changes

1. **One deterministic prefill pass.** Selecting a contact stores a "pending prefill" that keeps retrying on each render until every field it can fill is actually filled, then clears itself. It is never cleared while the destination country or bank/network list is still loading, and country-change resets no longer wipe fields that were just prefilled.
2. **Full field coverage.** Prefill now applies:
   - Recipient name and phone / mobile money number
   - Mobile money network (matched by id, payout code, or label — e.g. `airtel` -> Airtel Money)
   - Destination country from the contact's stored country
   - Bank name/code + account number (Nigeria, Ghana, other bank corridors)
   - Canadian rails: Interac email, EFT institution/transit/account, account holder
   - Email where the corridor asks for it
3. **Phone placeholder follows the destination** (Zambia shows `+260…`, Kenya `+254…`) instead of the hardcoded `+254…`.
4. **Visible confirmation.** The existing "Contact selected — Name" line gains a short summary of what was filled (e.g. "Airtel Money · +260 77 006 9550"), and clearing the contact clears the prefilled payout fields too.
5. Fields stay fully editable; a manual edit after prefill is never overwritten.

## Technical notes

- `src/pages/SendPage.tsx`: replace `applyBeneficiary` + the `pendingBeneficiary` effect with a single `prefillFromBeneficiary` reducer-style effect. Keep the beneficiary in state until an `appliedAll` check passes (country matches, and the needed list — `ngnBanks` / `ghBanks` / `targetCountry.networks` — is loaded). Add phone, network, Interac/EFT, and email to the applied set; track a `prefilledFields` set so the country-reset effect (currently around line 375) skips anything just prefilled.
- Mobile money number field (around line 2452) gets a country-derived placeholder from the destination dial code.
- `src/components/send/ContactQuickField.tsx` and the "All contacts" picker keep calling the same single entry point, so all three selection paths behave identically.
- `AddBeneficiaryModal` `onSaved` already routes through the same handler — verified after the refactor.
- Verification: run the flow in the preview with Patrick Matibini (Zambia/Airtel) and Samuel Egwu (Nigeria bank) and confirm number, network, and bank fields populate.
