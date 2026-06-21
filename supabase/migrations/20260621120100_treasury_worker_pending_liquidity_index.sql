-- Partial index for queued settlement transfers (requires enum value from prior migration).
CREATE INDEX IF NOT EXISTS idx_transfers_pending_liquidity
  ON public.transfers (status, created_at)
  WHERE status = 'pending_liquidity';
