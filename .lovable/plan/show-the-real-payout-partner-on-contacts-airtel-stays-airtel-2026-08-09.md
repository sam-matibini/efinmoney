# Show the real payout partner on contacts (Airtel stays Airtel)

## Problem
Contact rows show a generic "MoMo" for every mobile-money recipient, so an Airtel subscriber reads as "MoMo" instead of "Airtel". The label comes from the country's generic method text, not from the operator saved on the contact.

## Fix
1. **Use the contact's saved operator.** When a contact has a mobile-money operator stored, show its real name ("Airtel Money", "MTN MoMo", "Zamtel Kwacha", "M-Pesa") in the contacts list, grid cards, and the details sheet — never "MoMo".
2. **Infer the operator when none is saved.** For older contacts with no operator, derive it from the phone number prefix (Zambia: 076/096 Airtel, 077/097 MTN, 075/095 Zamtel; same idea for other supported countries). Show the inferred name, so an Airtel number never displays as MoMo.
3. **Fall back only when truly unknown.** If the operator can't be determined, show the neutral wording "Mobile money" instead of "MoMo".
4. **Consistency across the app.** Use one shared helper so the contacts list, contact details sheet, and the recipient rows in the send flow all render the same operator name.

## Technical notes
- Add a small helper (e.g. `src/lib/payoutPartner.ts`) that maps a beneficiary's `network` / `payout_method` plus phone prefix to a display label, using the `networks` arrays already defined per country in `src/lib/countries.ts` and the operator labels in `src/lib/mobileMoneyNetworks.ts`.
- Replace `methodLabel` in `src/pages/ContactsPage.tsx` with the helper; bank contacts keep the existing "Bank · <bank name>" line.
- Update the "Network" row in `src/components/contacts/ContactDetailsSheet.tsx` to render the same friendly label (and label it "Payout partner").
- Display-only change: no schema change, no routing or payout logic touched (Zambia stays Fincra-only).
