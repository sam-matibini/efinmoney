-- Beneficial Ownership Registry (FINTRAC Core Requirement #10)
-- Tracks Ultimate Beneficial Owners (UBOs) at 25% ownership threshold.
-- PEP status, sanctions status, and full historical records.

CREATE TABLE IF NOT EXISTS public.beneficial_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  dob date,
  nationality text,
  ownership_pct numeric(5,2) NOT NULL DEFAULT 0,
  voting_pct numeric(5,2) NOT NULL DEFAULT 0,
  control_pct numeric(5,2) NOT NULL DEFAULT 0,
  pep_status text NOT NULL DEFAULT 'none' CHECK (pep_status IN ('none', 'domestic_pep', 'foreign_pep', 'hio', 'family_member', 'close_associate')),
  sanctions_status text NOT NULL DEFAULT 'not_screened' CHECK (sanctions_status IN ('not_screened', 'clear', 'hit', 'escalated')),
  address text,
  id_document_type text,
  id_document_number text,
  id_document_ref text,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beneficial_owners_ownership_reasonable CHECK (ownership_pct >= 0 AND ownership_pct <= 100),
  CONSTRAINT beneficial_owners_voting_reasonable CHECK (voting_pct >= 0 AND voting_pct <= 100)
);

CREATE TABLE IF NOT EXISTS public.beneficial_owner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficial_owner_id uuid NOT NULL REFERENCES public.beneficial_owners(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id),
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'verified', 'pep_status_changed', 'sanctions_status_changed', 'removed')),
  old_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beneficial_owners_customer ON public.beneficial_owners(customer_id);
CREATE INDEX IF NOT EXISTS idx_beneficial_owners_pep ON public.beneficial_owners(pep_status);
CREATE INDEX IF NOT EXISTS idx_beneficial_owners_25pct ON public.beneficial_owners(customer_id, ownership_pct) WHERE ownership_pct >= 25;
CREATE INDEX IF NOT EXISTS idx_bo_history_owner ON public.beneficial_owner_history(beneficial_owner_id, created_at DESC);

ALTER TABLE public.beneficial_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficial_owner_history ENABLE ROW LEVEL SECURITY;

-- Admin, compliance, finance can read all beneficial owners
DROP POLICY IF EXISTS "Beneficial owners readable by admin roles" ON public.beneficial_owners;
CREATE POLICY "Beneficial owners readable by admin roles"
  ON public.beneficial_owners FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

-- Admin, compliance can manage beneficial owners
DROP POLICY IF EXISTS "Beneficial owners manageable by admin compliance" ON public.beneficial_owners;
CREATE POLICY "Beneficial owners manageable by admin compliance"
  ON public.beneficial_owners FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
  );

DROP POLICY IF EXISTS "Beneficial owners updatable by admin compliance" ON public.beneficial_owners;
CREATE POLICY "Beneficial owners updatable by admin compliance"
  ON public.beneficial_owners FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
  );

-- History readable by admin roles
DROP POLICY IF EXISTS "BO history readable by admin roles" ON public.beneficial_owner_history;
CREATE POLICY "BO history readable by admin roles"
  ON public.beneficial_owner_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.trigger_bo_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bo_updated_at ON public.beneficial_owners;
CREATE TRIGGER trg_bo_updated_at
  BEFORE UPDATE ON public.beneficial_owners
  FOR EACH ROW EXECUTE FUNCTION public.trigger_bo_updated_at();

-- Function: auto-log beneficial owner changes to history
CREATE OR REPLACE FUNCTION public.log_bo_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  change_type_val text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    change_type_val := 'created';
  ELSIF OLD.pep_status IS DISTINCT FROM NEW.pep_status THEN
    change_type_val := 'pep_status_changed';
  ELSIF OLD.sanctions_status IS DISTINCT FROM NEW.sanctions_status THEN
    change_type_val := 'sanctions_status_changed';
  ELSIF NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL THEN
    change_type_val := 'verified';
  ELSE
    change_type_val := 'updated';
  END IF;

  INSERT INTO public.beneficial_owner_history (
    beneficial_owner_id,
    changed_by,
    change_type,
    old_values,
    new_values
  ) VALUES (
    NEW.id,
    auth.uid(),
    change_type_val,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_bo_change ON public.beneficial_owners;
CREATE TRIGGER trg_log_bo_change
  AFTER INSERT OR UPDATE ON public.beneficial_owners
  FOR EACH ROW EXECUTE FUNCTION public.log_bo_change();

-- View: businesses with >= 25% owners that need review
CREATE OR REPLACE VIEW public.ubo_compliance_view AS
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  c.risk_level,
  COUNT(bo.id) FILTER (WHERE bo.ownership_pct >= 25) AS owners_25pct_plus,
  COUNT(bo.id) FILTER (WHERE bo.pep_status != 'none') AS pep_owners,
  COUNT(bo.id) FILTER (WHERE bo.sanctions_status = 'hit') AS sanctions_hits,
  COUNT(bo.id) FILTER (WHERE bo.verified_at IS NULL) AS unverified_owners,
  c.updated_at
FROM public.customers c
LEFT JOIN public.beneficial_owners bo ON bo.customer_id = c.id
WHERE c.company_type IS NOT NULL
GROUP BY c.id, c.name, c.risk_level, c.updated_at;

REVOKE ALL ON FUNCTION public.trigger_bo_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_bo_change() FROM PUBLIC;