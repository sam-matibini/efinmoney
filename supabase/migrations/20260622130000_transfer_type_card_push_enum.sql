-- Must run in its own migration: new enum values cannot be used in the same transaction.
-- payment-link-claim inserts transfer_type='card_push' for international (non-CA) Visa
-- Direct recipient-card claims, distinct from the existing 'domestic_canada' value.
ALTER TYPE public.transfer_type ADD VALUE IF NOT EXISTS 'card_push';
