-- Lets admins add APIs beyond Gemini, Plaid, and Resend.
-- field_schema describes the key and setting fields for a custom provider.

ALTER TABLE public.system_api_providers
  ADD COLUMN IF NOT EXISTS field_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
