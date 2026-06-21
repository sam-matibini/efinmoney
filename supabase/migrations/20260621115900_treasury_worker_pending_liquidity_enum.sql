-- Must run in its own migration: new enum values cannot be used in the same transaction.
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'pending_liquidity';
