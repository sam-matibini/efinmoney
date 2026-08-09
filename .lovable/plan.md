# Interac e-Transfer as a checkout method (Wise rails)

Add Interac e-Transfer as a first-class payment method — alongside Card, Bank and Wallet — for both wallet top-up and sending transfers. Modelled on how the Square card checkout is wired in (method row → dedicated checkout panel → intent → webhook credit), but funded through Wise instead of Square, because Wise fees are lower.

## What the user sees

**Wallet top-up (already partly built):** the CAD collection screen keeps its Interac tab, with the sender form, Wise deposit alias, reference and copy button. No behaviour change other than shared polish with the send flow.

**Send money:** for CAD funding only, a fourth option appears in the "Pay with" row: *Interac e-Transfer — from your Canadian bank*. Selecting it shows an Interac checkout panel in place of the card panel:

- Amount + fee summary (same summary component as card/bank/wallet)
- Sender name, sender email, and optional bank — prefilled from the profile
- On Confirm: the transfer is saved as awaiting funding and the panel shows the Wise deposit alias, the exact CAD amount, and a copyable reference plus step-by-step instructions
- A "Waiting for your Interac transfer…" state, and the tracking page shows the same instructions until funds arrive

When the e-Transfer lands, the wallet is credited and the payout **executes automatically** — the sender does not have to come back and confirm.

## Backend

1. **Migration** on `fincra_cad_interac_intents`: add nullable `transfer_id uuid` (references `transfers`) and `purpose text` (`'topup' | 'transfer'`, default `'topup'`), plus an index on `transfer_id`.
2. **`fincra-cad-interac` edge function**: accept optional `transfer_id` and `purpose` on the `create` action (validated with the existing pattern), persist them, and include them in pending-intent lookups. Deposit instructions gain the transfer context when `purpose = 'transfer'`.
3. **`wise-webhook`**: after `creditWalletViaWise` succeeds for a `fincra_cad_interac_intents` match, if the intent has a `transfer_id`, invoke `execute-transfer` for that transfer with the same idempotency key. Log and surface any payout error onto the transfer row (`status = 'failed'`, `failure_reason`) so the sender sees the reason instead of a stuck "processing".

## Frontend

- `src/pages/SendPage.tsx`: extend `FundingSource` with `'interac'`; add the option to `fundingMethodOptions` only when the funding currency is CAD; route `handleConfirm` for `funding === 'interac'` to create the transfer record with `funding_source: 'interac'` (no wallet debit, no immediate `execute-transfer`), then create the Interac intent with `transfer_id` and `purpose: 'transfer'` and advance to the instructions/tracking step.
- `src/components/send/MethodCheckoutPanel.tsx`: add an `interac` branch reusing `ChargeSummary`, rendering the shared Interac sender form + instructions.
- Extract the sender form, alias/reference display and instruction list out of `CadInteracTopUpCard.tsx` into a shared `src/components/payments/InteracCheckout.tsx` so top-up and send render identical UI; `CadInteracTopUpCard` becomes a thin top-up wrapper (`purpose: 'topup'`).
- Interac stays hidden for non-CAD funding currencies, matching the Wise CAD rail.

## Notes

- Interac is a push rail: no card details are collected and Wise cannot pull funds, so the sender always initiates from their bank app using the reference. The reference match in the webhook is what links the deposit to the transfer.
- No new secrets are needed — the existing `WISE_CAD_INTERAC_ALIAS` / Wise receive-options resolution is reused.
