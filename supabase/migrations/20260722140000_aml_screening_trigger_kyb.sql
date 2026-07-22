-- Add 'kyb' to aml_screening_trigger.
--
-- Deliberately its own migration: ALTER TYPE ... ADD VALUE cannot be used by a
-- statement in the same transaction that adds it, so the value has to be
-- committed before 20260722141000 can reference it.

ALTER TYPE public.aml_screening_trigger ADD VALUE IF NOT EXISTS 'kyb';
