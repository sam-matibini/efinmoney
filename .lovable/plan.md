## Cancel Transfer & Instant Refund

Allow users to cancel a transfer that hasn't been paid out yet and immediately get the money credited back to their wallet.

### Cancellation eligibility
A transfer can be cancelled when its status is one of:
- `initiated` — no ledger posting yet, just mark cancelled
- `funded` or `processing` — ledger was debited but the upstream payout hasn't been confirmed (no provider_reference, or Flutterwave queued/failed/timed out)

Cannot cancel: `completed`, `reversed`, `failed` (already auto-refunded), `expired`.

### Backend: new edge function `cancel-transfer`
1. Auth: require Bearer token, load transfer where `sender_id = auth.uid()`.
2. Guard: reject if status not in {initiated, funded, processing}.
3. If a `provider_reference` exists, attempt a best-effort cancel against Flutterwave's `/transfers/{id}` DELETE; if it returns "already paid"/"successful", abort with 409 and surface the message.
4. Reverse the original ledger journal:
   - Find all `ledger_entries` where `reference_type='transfer'` and `reference_id=transfer.id`.
   - Insert a new journal with debit/credit swapped on every line, `description = "Cancellation refund for <ref>"`, `reference_type='transfer_cancellation'`, `reference_id=transfer.id`.
   - This instantly restores the wallet balance (balances are derived from the ledger view per project memory).
5. Update `transfers` row: `status='reversed'`, `failure_reason='Cancelled by user'`, `completed_at=now()`.
6. Return success.

### Frontend
- `src/hooks/useTransfers.tsx`: add `useCancelTransfer` mutation that invokes `cancel-transfer` and invalidates `['transfers']` and `['wallets']`.
- `src/pages/TransferTrackingPage.tsx`: add a "Cancel transfer" destructive button (with AlertDialog confirm) visible only when `['initiated','funded','processing'].includes(transfer.status)`. On success, toast "Transfer cancelled — funds returned to your wallet" and the realtime channel will repaint the status badge.
- `src/pages/TransfersListPage.tsx`: optional row-level kebab "Cancel" on eligible transfers (same hook).

### Technical notes
- No schema changes needed; reuses existing `transfers.status='reversed'` and `ledger_entries`.
- Idempotency: the function checks for an existing journal with `reference_type='transfer_cancellation'` first and short-circuits if found, so double-clicks don't double-refund.
- The existing `execute-transfer` auto-refund-on-payout-failure logic is unchanged; this is a parallel user-initiated path.