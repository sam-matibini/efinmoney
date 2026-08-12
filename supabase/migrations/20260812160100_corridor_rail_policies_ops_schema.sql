-- Preferred rail + optional ordered failover; pending_ops holds funds for manual settle.

CREATE TABLE IF NOT EXISTS public.corridor_rail_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('collect', 'payout')),
  country_code text NOT NULL DEFAULT '',
  currency_code text NOT NULL,
  preferred_partner text NOT NULL,
  failover_partners text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corridor_rail_policies_currency_upper CHECK (currency_code = upper(currency_code)),
  CONSTRAINT corridor_rail_policies_country_upper CHECK (country_code = upper(country_code))
);

CREATE UNIQUE INDEX IF NOT EXISTS corridor_rail_policies_uniq
  ON public.corridor_rail_policies (direction, country_code, currency_code);

CREATE INDEX IF NOT EXISTS idx_corridor_rail_policies_enabled
  ON public.corridor_rail_policies (enabled, direction, currency_code);

ALTER TABLE public.corridor_rail_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corridor_rail_policies_select ON public.corridor_rail_policies;
CREATE POLICY corridor_rail_policies_select
  ON public.corridor_rail_policies FOR SELECT TO authenticated
  USING (
    enabled = true
    OR public.is_pricing_manager(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS corridor_rail_policies_write ON public.corridor_rail_policies;
CREATE POLICY corridor_rail_policies_write
  ON public.corridor_rail_policies FOR ALL TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_pricing_manager(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON public.corridor_rail_policies TO authenticated;
GRANT ALL ON public.corridor_rail_policies TO service_role;

-- Ops hold metadata on transfers (status uses pending_ops enum value)
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS ops_status text,
  ADD COLUMN IF NOT EXISTS ops_note text,
  ADD COLUMN IF NOT EXISTS rails_attempted text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ops_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ops_resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transfers_pending_ops
  ON public.transfers (status, created_at DESC)
  WHERE status = 'pending_ops';

-- Lightweight audit for policy changes
CREATE TABLE IF NOT EXISTS public.corridor_rail_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES public.corridor_rail_policies(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_row jsonb,
  after_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.corridor_rail_policy_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corridor_rail_policy_audit_select ON public.corridor_rail_policy_audit;
CREATE POLICY corridor_rail_policy_audit_select
  ON public.corridor_rail_policy_audit FOR SELECT TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON public.corridor_rail_policy_audit TO authenticated;
GRANT ALL ON public.corridor_rail_policy_audit TO service_role;
