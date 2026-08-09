# Interac e-Transfer via Wise: remove the "not available yet" error

The Interac tab currently checks a Fincra alias secret. Because that alias is unset, it shows "Interac e-Transfer is not available yet. Use card checkout or pay by invoice instead." and disables the button. Interac now lands in the Wise CAD balance at `etx@efin.money`, so the tab should be Wise-backed.

## Changes

1. **Interac alias comes from Wise** (`supabase/functions/fincra-cad-interac/index.ts`)
   - Resolve the deposit alias in this order: an Interac/e-Transfer receive option returned by Wise's CAD account details, then the `WISE_CAD_INTERAC_ALIAS` secret (`etx@efin.money`), then the legacy `FINCRA_CAD_INTERAC_ALIAS`.
   - `configured` is true when any of those resolve, so intent creation is no longer blocked by the Fincra secret.
   - Instructions text drops vendor names and reads: send exactly CAD <amount> to <alias>, autodeposit on, include the reference in the message field.

2. **Store the alias** — save `etx@efin.money` as the `WISE_CAD_INTERAC_ALIAS` secret so the fallback always works even if Wise does not expose an Interac receive option.

3. **Frontend message** (`src/components/payments/CadInteracTopUpCard.tsx`)
   - Remove the "not available yet / use card checkout" copy. If no alias can be resolved at all, show a neutral "Interac details are being prepared — try again in a moment" note instead of a hard block.
   - Show the reference with a copy button and the note that it must go in the e-Transfer message field.

4. **Panel copy** (`src/components/topup/CadCollectionPanel.tsx`) — the Bank EFT tab keeps its CAD availability preflight; no change to the Interac tab gating.

## Technical notes

- Crediting is unchanged: `wise-webhook` already matches incoming CAD credits to `fincra_cad_interac_intents` by reference, then amount + currency within the pending window.
- No database migration; `fincra_cad_interac_intents` already carries reference, status and expiry.
- Edge function to redeploy: `fincra-cad-interac`.
- Verify with `bunx tsgo --noEmit` and a Playwright pass on `/wallet/topup` with a CAD wallet, confirming the Interac tab returns an alias and reference with no error banner.
