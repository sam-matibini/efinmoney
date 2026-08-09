# Interac e-Transfer: auto-open sender form, then deposit instructions

Interac e-Transfer is a push rail — Wise is receive-only here, so no card can be charged and no debit can be pulled. Instead, the Interac tab opens straight into a short sender form, records who is sending, and then shows the exact deposit details. The existing Wise webhook credits the wallet when the money lands and the reference matches.

## Flow

```text
Interac tab opens
  -> Step 1: "Your e-Transfer details" form (auto-focused, no click needed)
       Amount (prefilled) | Sender full name | Sender email | Sending bank (optional)
       [Continue]
  -> Step 2: Deposit instructions (existing card)
       Send exactly CAD x.xx  |  Recipient alias  |  Reference (copy)
       Waiting for your Interac transfer...  ->  Credited
```

Existing pending intents skip Step 1 and land directly on Step 2.

## What changes

**Frontend — `src/components/payments/CadInteracTopUpCard.tsx`**
- Replace the "Get Interac details" button with an inline form shown immediately on mount (no auto-create before the user confirms sender details).
- Fields: amount (prefilled from top-up, editable when not passed in), sender name, sender email, sending bank. Validated with zod: name 2–100 chars, email valid + max 255, bank optional max 100, amount >= 1.
- Submit calls the edge function with the sender details, then renders the existing instruction/reference panel unchanged.
- Keep the pending-intent bootstrap and the 5s status polling as they are; keep the inline error + "Try again".

**Edge function — `supabase/functions/fincra-cad-interac/index.ts`**
- Accept and validate `sender_name`, `sender_email`, `sender_bank` on the `create` action; reject with 400 on bad input.
- Persist them on the intent row and echo them back so the summary can show "Sending from ...".
- Instructions get a line reminding the sender to send from the email they entered so autodeposit matching stays clean.

**Database — `fincra_cad_interac_intents`**
- Add nullable `sender_name text`, `sender_email text`, `sender_bank text`.
- No policy changes; grants already in place from the earlier fix.

## Not in scope
- No card fields on the Interac tab (there is no card in an e-Transfer).
- No Wise pull/PISP debit — that needs a Wise capability you do not have enabled yet. The form leaves room to add it later without reworking the UI.
