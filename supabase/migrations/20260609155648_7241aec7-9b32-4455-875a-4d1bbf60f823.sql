
CREATE TABLE public.sumsub_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_id text NOT NULL UNIQUE,
  level_name text NOT NULL,
  review_status text,
  review_answer text,
  review_reject_type text,
  moderation_comment text,
  client_comment text,
  risk_labels jsonb DEFAULT '[]'::jsonb,
  raw_payload jsonb,
  requested_by_admin_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, level_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sumsub_verifications TO authenticated;
GRANT ALL ON public.sumsub_verifications TO service_role;

ALTER TABLE public.sumsub_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sumsub verifications"
  ON public.sumsub_verifications FOR ALL
  TO authenticated
  USING (public.is_kyc_reviewer(auth.uid()))
  WITH CHECK (public.is_kyc_reviewer(auth.uid()));

CREATE TRIGGER trg_sumsub_verifications_updated_at
  BEFORE UPDATE ON public.sumsub_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sumsub_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id text,
  event_type text,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sumsub_webhook_logs TO authenticated;
GRANT ALL ON public.sumsub_webhook_logs TO service_role;

ALTER TABLE public.sumsub_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sumsub webhook logs"
  ON public.sumsub_webhook_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE INDEX idx_sumsub_webhook_logs_applicant ON public.sumsub_webhook_logs(applicant_id);
CREATE INDEX idx_sumsub_verifications_user ON public.sumsub_verifications(user_id);
