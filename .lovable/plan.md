## Goal

When a cross-border transfer fails at the Flutterwave payout step (e.g. IP whitelisting error, network down, invalid number), automatically post a **reversal journal entry** that restores the full debited amount (principal + fee) to the sender's wallet, instead of leaving the funds stranded as a "failed" transfer.

For the existing failed transfer (`9ad521b9…`, Fred Yumba / ZMW), we'll also post a one-time backfill reversal so the C$7.99 is returned now.

## What Changes

### 1. New shared reversal helper inside `flutterwave-payout/index.ts`

Add a `reverseTransferLedger(transfer_id)` function that:
- Loads all `ledger_entries` for `reference_type='transfer'` and `reference_id=transfer_id`.
- If a reversal journal already exists (description starts with `REVERSAL:`), skip — idempotent.
- Creates a new `journal_id` and posts the **mirror** of every original line:
  - Original debit → reversal credit (same account, wallet, currency, amount)
  - Original credit → reversal debit
- Description: `REVERSAL: <original description>`
- `reference_type='transfer_reversal'`, `reference_id=transfer_id`.

Net effect for this case:
```
Original                                  Reversal
DR  CAD wallet liability   7.99   →   CR  CAD wallet liability   7.99
CR  Transfer Fees revenue  2.99   →   DR  Transfer Fees revenue  2.99
CR  ZMW Mobile Money Pay   27.77  →   DR  ZMW Mobile Money Pay   27.77
```
Wallet balance is restored, fee revenue is reversed, and the ZMW payable is cleared. Books stay balanced.

### 2. Call the reversal on every failure branch

Currently three places in `flutterwave-payout/index.ts` mark the transfer `failed` without refunding:
- Unsupported network (line ~114)
- Flutterwave API non-OK response (line ~158) ← this is the IP-whitelist case
- Catch-all `catch` block (line ~196)

Each will call `reverseTransferLedger(transfer_id)` **before** updating notifications, and the user-facing notification will read:
> *"Your CAD 7.99 transfer to Fred Yumba failed and has been refunded to your CAD wallet."*

### 3. Same reversal hook in `flutterwave-webhook/index.ts`

If Flutterwave later sends a `transfer.failed` webhook (async failure after initial accept), reverse the ledger there too. Idempotency check prevents double-refund if both paths fire.

### 4. One-time backfill for the existing failed transfer

A small SQL insert posts the reversal journal for transfer `9ad521b9-413f-4a79-98f1-1a16c07f2afd` so Sam's CAD wallet immediately gets the C$7.99 back, plus a notification. This will be presented as a data-change for approval.

## What Does NOT Change

- The `transfers` row keeps `status='failed'` and the original `failure_reason` for audit.
- No Stripe refund is needed — the funds were already in the digital wallet (no card was charged for this specific transfer).
- No schema changes, no new tables.
- UI doesn't change; the wallet balance refresh and notification toast already react to the new ledger entry + notification row via existing realtime hooks.

## Verification

1. Deploy `flutterwave-payout` + `flutterwave-webhook`.
2. Run the backfill migration → confirm Sam's CAD wallet balance increases by 7.99 and a "refunded" notification appears.
3. Trigger another small ZMW transfer (still failing on IP whitelist) → confirm ledger auto-reverses and balance returns within ~1s.
