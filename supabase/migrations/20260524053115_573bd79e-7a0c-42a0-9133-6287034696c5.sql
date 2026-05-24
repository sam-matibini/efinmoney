
ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS interac_session_id text,
  ADD COLUMN IF NOT EXISTS interac_sub text,
  ADD COLUMN IF NOT EXISTS interac_verification_status text,
  ADD COLUMN IF NOT EXISTS interac_claims jsonb,
  ADD COLUMN IF NOT EXISTS interac_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_provider text;

CREATE TABLE IF NOT EXISTS public.interac_sessions (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interac_sessions ENABLE ROW LEVEL SECURITY;

-- No client policies needed: only edge functions (service role) access this table.
CREATE INDEX IF NOT EXISTS idx_interac_sessions_expires ON public.interac_sessions(expires_at);
