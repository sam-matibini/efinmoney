## Goal

Make both Interac flows testable now that the `INTERAC_*` / `INTERAC_HUB_*` secrets are in place:

1. **Interac Sign-In (KYC)** on `/onboarding/identity` — confirm the existing wiring works end-to-end with the new secrets.
2. **Interac e-Transfer payout** on `/send?mode=canada` — restore the UI tile (behind a flag) so it's ready to test the moment Paysafe enables `INTERAC_ETRANSFER` on the merchant account.

## 1. Interac KYC (already built, just verify)

Pieces already in place:
- `supabase/functions/interac-start` — builds OIDC auth URL
- `supabase/functions/interac-callback` — handles redirect-back
- `supabase/functions/interac-exchange` — token exchange
- `supabase/functions/interac-jwks` — JWKS endpoint
- `src/components/kyc/InteracVerification.tsx` — "Verify with Interac" button
- `src/pages/onboarding/Identity.tsx` — already renders the Interac panel and handles `?interac=success|error` redirect

Actions:
- Read the 4 edge functions and confirm they reference the new secret names exactly as added.
- Add a small "Test Interac KYC" smoke test: click button on `/onboarding/identity`, follow redirect, confirm we land back with `?interac=success` and KYC status updates.
- Surface clearer error toast if any required secret is missing at runtime.

No schema changes. No new files.

## 2. Interac e-Transfer payout (restore UI behind flag)

Current state: tile is hidden in `CanadaSendFlow.tsx`; backend (`paysafe-payout`) Interac branch is dormant but intact.

Actions in `src/components/send/CanadaSendFlow.tsx`:
- Re-add the Interac tile to the Delivery Method grid, labelled **"Interac e-Transfer (testing)"** with a small "Beta" badge.
- Restore Step-2 recipient inputs: email, security question, security answer (code is still in the file, just unreferenced).
- Restore Step-3 summary lines and Send button label.
- Keep funding (wallet / card) selector as-is.
- Gate the tile behind a single constant `INTERAC_ETRANSFER_ENABLED = true` at the top of the file so we can flip it off in one line if Paysafe rejects again.

No backend changes — `paysafe-payout` already routes `method: "interac"` to the Interac branch. If Paysafe still returns `PAYMENTHUB-1`, the error surfaces in the existing toast and we leave the flag on for retry.

## Out of scope

- Switching e-Transfer provider away from Paysafe.
- Any change to wallet/card funding logic, fees, or ledger postings.
- Changes to other delivery methods (EFT, Card Push).

## Files touched

- `src/components/send/CanadaSendFlow.tsx` — restore Interac tile + inputs behind flag
- `src/pages/onboarding/Identity.tsx` — minor: clearer error messaging only if needed
- `supabase/functions/interac-*` — read-only verification; edit only if a secret name mismatch is found
