# CAD collection checkout: Interac + Bank EFT (Wise)

## Part 1 — Card pay-in partner review (findings, no code)

Card pay-in rails wired in this project today:

| Partner | Card pay-in scope | State |
| --- | --- | --- |
| Square | USD, CAD, EUR, GBP hosted checkout | Live, first in western auto-pick priority |
| Dodo | USD, CAD, EUR, GBP merchant-of-record checkout | Live |
| PayPal | USD, CAD, EUR, GBP orders | Live |
| Fincra | NGN + Africa + EUR/GBP hosted checkout; CAD charged as USD then credited to the CAD wallet | Live, but excluded from card-*send* on USD/CAD (partner confirmed no collect) |
| Flutterwave / Lenhub | NGN, GHS, KES, UGX, TZS, RWF, ZMW plus USD/CAD card | Live; Lenhub is the same Flutterwave stack, skipped in auto-pick |
| Paytota | USD, EUR, GBP, CAD invoice link; UGX/KES/RWF MoMo | Live |
| Nomba | NGN live; USD/EUR/GBP/CAD international marked "Coming soon" (provider returns empty checkout links) | Partly blocked |
| Swychr | XAF, XOF, KES, UGX | Live |
| Adyen | Sessions / pay-by-link tables present | Present, not in the top-up picker |
| Stripe | Card charge functions exist | Hard kill-switch: `STRIPE_PAYMENTS_ENABLED = false` |

Gaps worth noting: no true CAD-native card acquirer (CAD card top-ups are charged in USD via Fincra or handled by Square/Dodo/PayPal), Nomba international still dead, and Adyen is built but not surfaced. No changes to these in this plan.

## Part 2 — CAD collection flow (Interac + Bank EFT via Wise)

Scope confirmed: Wise is used to **receive** pushed CAD (EFT / direct deposit), not to debit the sender. Credit is automatic from the Wise webhook for both rails.

What already exists and is reused:
- `wise-topup-intent` — creates an intent, resolves the profile, and returns live Wise account-detail fields plus a unique reference.
- `wise_topup_intents` table and `Wise Settlement CAD` ledger account (`1321`).
- `wise-webhook` — matches `balances#credit` by reference first, then amount + currency, and credits the wallet through `creditWalletViaWise`.
- `fincra-cad-interac` — Interac e-Transfer intent with alias, amount and reference.

### Changes

1. **New CAD collection panel** (`src/components/topup/CadCollectionPanel.tsx`) with two tabs on one screen:
   - *Interac e-Transfer* — amount, then the alias, exact amount and reference to paste into the memo, with a live status poll.
   - *Bank EFT (Wise)* — amount, then the Wise CAD institution / transit / account number, beneficiary name and unique reference, with copy buttons and the same status poll.
   Both tabs show a "waiting for your deposit" state that flips to credited when the intent completes.

2. **Wire it into Top up** (`src/pages/TopUpPage.tsx`) — for CAD wallets, the `interac` and `wise` methods route to the new panel instead of the current separate Interac card and generic Wise bank-transfer block. Labels stay white-label ("Interac e-Transfer", "Bank transfer"); no vendor names for customers.

3. **CAD routing** (`src/lib/walletTopupGateway.ts`) — keep `preferWise` → `wise_pay` and `preferInterac` → `fincra_interac`, and make CAD auto-pick prefer these bank rails ahead of card rails where they are configured, since they are the cheapest CAD path.

4. **Interac auto-credit** (`supabase/functions/wise-webhook/index.ts`) — extend the matcher so an unmatched CAD `balances#credit` is also checked against pending `fincra_cad_interac_intents` (reference first, then amount + currency + pending window). On match, credit the wallet with the same idempotency guard and stamp `credited_at` / `provider_reference`. Unmatched CAD credits keep raising the existing admin notification so ops can still reconcile manually.

5. **Preflight guard** — the EFT tab calls the existing `?diagnose=1` path; if CAD is not in the Wise `currencies_active` list, it shows "Bank EFT is not available yet" instead of empty account details, and the Interac tab stays usable.

### Technical notes

- No new tables: `wise_topup_intents` covers EFT, `fincra_cad_interac_intents` covers Interac. One small migration only if the Interac intents table lacks a `provider_reference` column needed to store the Wise balance/transfer id — verified during implementation before writing any SQL.
- Deposits are always matched by unique reference first; amount + currency matching stays restricted to pending, unexpired intents to avoid mis-crediting.
- Edge functions touched: `wise-webhook` (redeploy). `wise-topup-intent` and `fincra-cad-interac` are unchanged unless the diagnose payload needs the CAD flag surfaced.
- Verification: `bunx tsgo --noEmit`, plus a Playwright pass on `/top-up` with a CAD wallet to confirm both tabs render account details, references and the polling state.
