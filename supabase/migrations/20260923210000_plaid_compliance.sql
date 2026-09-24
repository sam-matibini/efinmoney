-- Plaid Identity Verification + Identity ownership + Monitor screening

ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS plaid_identity_verification_id text,
  ADD COLUMN IF NOT EXISTS plaid_idv_status text,
  ADD COLUMN IF NOT EXISTS plaid_idv_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_plaid_idv_id
  ON public.kyc_verifications (plaid_identity_verification_id)
  WHERE plaid_identity_verification_id IS NOT NULL;

COMMENT ON COLUMN public.kyc_verifications.plaid_identity_verification_id IS
  'Plaid Identity Verification session id (idv_…)';
COMMENT ON COLUMN public.kyc_verifications.plaid_idv_status IS
  'Latest Plaid IDV status (active, success, failed, expired, canceled, pending_review)';
COMMENT ON COLUMN public.kyc_verifications.plaid_idv_payload IS
  'Last /identity_verification/get payload snapshot';

-- Bank account ownership from /identity/get
CREATE TABLE IF NOT EXISTS public.plaid_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id uuid NOT NULL REFERENCES public.plaid_items(id) ON DELETE CASCADE,
  plaid_account_id uuid REFERENCES public.plaid_accounts(id) ON DELETE SET NULL,
  names jsonb NOT NULL DEFAULT '[]'::jsonb,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_status text NOT NULL DEFAULT 'unknown',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaid_item_id)
);

CREATE INDEX IF NOT EXISTS idx_plaid_identity_checks_user
  ON public.plaid_identity_checks (user_id);

ALTER TABLE public.plaid_identity_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own plaid identity checks" ON public.plaid_identity_checks;
CREATE POLICY "Users view own plaid identity checks"
  ON public.plaid_identity_checks FOR SELECT
  USING (auth.uid() = user_id);

-- Plaid Monitor (watchlist) entities / screenings
CREATE TABLE IF NOT EXISTS public.plaid_monitor_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  screening_id text NOT NULL UNIQUE,
  client_user_id text,
  given_name text,
  family_name text,
  status text NOT NULL DEFAULT 'pending_review',
  program_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plaid_monitor_entities_subject_chk CHECK (
    user_id IS NOT NULL OR business_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_plaid_monitor_entities_user
  ON public.plaid_monitor_entities (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.plaid_monitor_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own plaid monitor entities" ON public.plaid_monitor_entities;
CREATE POLICY "Users view own plaid monitor entities"
  ON public.plaid_monitor_entities FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.plaid_monitor_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id text NOT NULL,
  entity_row_id uuid REFERENCES public.plaid_monitor_entities(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  webhook_code text,
  status text NOT NULL DEFAULT 'pending_review',
  raw_payload jsonb,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_monitor_hits_screening
  ON public.plaid_monitor_hits (screening_id);
CREATE INDEX IF NOT EXISTS idx_plaid_monitor_hits_open
  ON public.plaid_monitor_hits (status)
  WHERE resolved_at IS NULL;

ALTER TABLE public.plaid_monitor_hits ENABLE ROW LEVEL SECURITY;

-- Staff read via service role; users do not need direct access to hits.
