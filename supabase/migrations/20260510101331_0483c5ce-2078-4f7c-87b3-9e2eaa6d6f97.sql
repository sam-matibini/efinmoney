
ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS persona_inquiry_status text,
  ADD COLUMN IF NOT EXISTS persona_verification_data jsonb,
  ADD COLUMN IF NOT EXISTS persona_session_token text,
  ADD COLUMN IF NOT EXISTS persona_decision text,
  ADD COLUMN IF NOT EXISTS persona_decision_reason text;

CREATE INDEX IF NOT EXISTS idx_kyc_persona_inquiry_id ON public.kyc_verifications(persona_inquiry_id);

CREATE TABLE IF NOT EXISTS public.persona_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  inquiry_id text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_webhook_logs_received_at ON public.persona_webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_persona_webhook_logs_inquiry ON public.persona_webhook_logs(inquiry_id);

ALTER TABLE public.persona_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read persona webhook logs" ON public.persona_webhook_logs;
CREATE POLICY "Admins read persona webhook logs"
  ON public.persona_webhook_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));
