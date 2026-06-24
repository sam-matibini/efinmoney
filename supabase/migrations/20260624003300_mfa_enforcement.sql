-- Multi-Factor Authentication Enforcement (#28)
-- Mandatory MFA for compliance, finance, admin, executive roles.

CREATE TABLE IF NOT EXISTS public.mfa_enforcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  enforced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role)
);

INSERT INTO public.mfa_enforcements (role, is_mandatory)
VALUES
  ('admin', true),
  ('finance', true),
  ('compliance', true)
ON CONFLICT (role) DO UPDATE SET is_mandatory = true, updated_at = now();

ALTER TABLE public.mfa_enforcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MFA enforcements readable by all authenticated" ON public.mfa_enforcements;
CREATE POLICY "MFA enforcements readable by all authenticated"
  ON public.mfa_enforcements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "MFA enforcements manageable by admin" ON public.mfa_enforcements;
CREATE POLICY "MFA enforcements manageable by admin"
  ON public.mfa_enforcements FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function: check if a user's roles require MFA
CREATE OR REPLACE FUNCTION public.check_mfa_required(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.mfa_enforcements mfe ON mfe.role = ur.role AND mfe.is_mandatory = true
    WHERE ur.user_id = p_user_id
  ) INTO v_required;
  RETURN v_required;
END;
$$;

REVOKE ALL ON FUNCTION public.check_mfa_required(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_mfa_required(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_mfa_required(uuid) TO service_role;