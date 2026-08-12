-- Admin corridor rail policies + ops hold on transfers
-- Enum must commit before it can be used in indexes/constraints (separate migration follows).

ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'pending_ops';
