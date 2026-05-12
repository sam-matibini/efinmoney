## Goal

Wire Paysafe's Interac e-Transfer API into the Canadian send flow so CAD→CAD transfers stop getting stuck at `funded` and actually deliver to the recipient's email (Interac) or bank (EFT). Today `execute-transfer` only triggers a payout for African corridors — Canada has no payout rail.

## Why Paysafe

Paysafe is one of the few sponsor-bank-backed providers exposing Interac e-Transfer Send/Request and EFT/Direct Debit via REST. Sandbox is self-serve, and a single API key handles both rails — fits how the rest of our payout adapters (Flutterwave, Stripe ACSS) are structured.

## Credentials needed (added via secrets tool after approval)

- `PAYSAFE_API_KEY` — Basic auth username:password from the Paysafe dashboard (Developer Center → Keys)
- `PAYSAFE_ACCOUNT_ID` — the merchant account ID for CAD Interac/EFT
- `PAYSAFE_ENV` — `test` (api.test.paysafe.com) or `live` (api.paysafe.com)
- `PAYSAFE_WEBHOOK_SECRET` — for verifying status callbacks

## Backend changes

### 1. New edge function: `supabase/functions/paysafe-payout/index.ts`

Single entrypoint called by `execute-transfer` after the ledger journal is posted. Accepts `{ transfer_id }`, loads the transfer row, branches on `payout_method`:

**Interac e-Transfer** (`POST /alternatepayments/v1/accounts/{accountId}/etransfers`)
```
{
  merchantRefNum: "EFM-{transfer_id}",
  amount: <cents>,
  currencyCode: "CAD",
  recipient: { firstName, lastName, email },
  notification: { recipientLanguage: "en" },
  securityQuestion: { question, answer }, // auto-deposit fallback
  callbackUrl: "{SUPABASE_URL}/functions/v1/paysafe-webhook"
}
```
Auto-generate a security question/answer pair (stored on the transfer row, surfaced to the sender on the success screen + receipt). If recipient has Interac Auto-Deposit, Paysafe skips the Q&A.

**EFT / Direct Credit** (`POST /directdebit/v1/accounts/{accountId}/standalonecredits`)
```
{
  merchantRefNum, amount, ach: { accountType: "CHECKING", ... },
  // Canadian: use bankAccount.eft with institutionId, transitNumber, accountNumber
  profile: { firstName, lastName, email? }
}
```

On success: update `transfers.status = 'processing'`, store Paysafe `id` as `provider_reference`. On 4xx: mark `failed`, store reason, refund wallet via reversing journal.

### 2. New edge function: `supabase/functions/paysafe-webhook/index.ts`

Verifies HMAC signature with `PAYSAFE_WEBHOOK_SECRET`, then:
- `COMPLETED` / `DELIVERED` → `transfers.status = 'completed'` (existing trigger fires receipt email)
- `FAILED` / `DECLINED` / `CANCELLED` → mark `failed`, post reversing journal, notify user

### 3. Update `supabase/functions/execute-transfer/index.ts`

Add a CAD branch alongside the existing African-corridor block: when `transfer_type === 'domestic_canada'`, invoke `paysafe-payout` instead of `flutterwave-payout`.

### 4. Migration

Add columns to `transfers` for Interac specifics (nullable, no breaking change):
- `interac_security_question text`
- `interac_security_answer text` (encrypted-at-rest is fine via RLS; only sender can read)
- `paysafe_payment_id text`

RLS: sender can read their own question/answer; nobody else.

## Frontend changes

### `src/components/send/CanadaSendFlow.tsx`
- Step 2 (Interac branch): add **Security Question** + **Answer** inputs (optional — auto-generated if blank), with a hint about Interac Auto-Deposit.
- Step 3 (success): if a security Q&A was used, display it prominently with a copy button so the sender can share it with the recipient out-of-band.
- Wire `payout_method` already maps cleanly (`interac` / `eft`); no change to `useCreateTransfer`.

### `src/lib/receipt.ts` / receipt edge function
- Include security Q on the PDF receipt (not the answer) for Interac transfers.

## Out of scope

- Interac Request Money (pull) — only Send is needed for /send page
- Bulk payouts — single payment per transfer is fine for MVP
- Live-mode certification with Paysafe — user must complete that with Paysafe directly before flipping `PAYSAFE_ENV=live`

## Rollout

1. User approves plan → I request the 4 secrets via `add_secret`
2. I build the migration, two edge functions, and frontend changes
3. We test in Paysafe sandbox with a real Interac email (sandbox sends a real-looking notification but no money moves)
4. User completes Paysafe live onboarding when ready, flips `PAYSAFE_ENV=live`
