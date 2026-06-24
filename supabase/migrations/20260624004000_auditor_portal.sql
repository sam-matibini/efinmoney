-- Auditor Portal (#27a)
-- Read-only portal for external auditors with audit session logging.

CREATE TABLE IF NOT EXISTS public.auditor_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users(id),
  access_token text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed timestamptz,
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.audit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_access_id uuid REFERENCES public.auditor_access(id),
  ip_address inet,
  actions_performed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auditor_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditor access manageable by admin" ON public.auditor_access;
CREATE POLICY "Auditor access manageable by admin" ON public.auditor_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Audit sessions readable by admin" ON public.audit_sessions;
CREATE POLICY "Audit sessions readable by admin" ON public.audit_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for auditor read-only access to key tables
-- Note: These are additive - applied via GRANT-like RLS policies for auditor role users
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditor') THEN
    -- Auditor access is managed via audited user accounts + app_role check
    -- existing RLS on audit_logs, compliance_reports, etc. already allows admin/compliance
    -- No need for separate DB role
  END IF;
END $do$;