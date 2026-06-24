-- Incident Management Module (RPAA Modules 4 + 6)
-- Captures operational incidents: service outages, security breaches,
-- safeguarding failures, fraud events. Auto-identifies RPAA-significant incidents.

CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category text NOT NULL CHECK (category IN ('service_outage', 'security_breach', 'safeguarding_failure', 'fraud_event', 'processor_outage', 'compliance_breach', 'other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'root_cause_analysis', 'corrective_action', 'closed', 'reopened')),
  description text,
  impact text,
  affected_systems text[] DEFAULT '{}'::text[],
  is_rpaa_significant boolean NOT NULL DEFAULT false,
  reported_by uuid REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  root_cause text,
  remediation text,
  corrective_action text,
  closed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incident_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_change', 'assignment', 'comment', 'root_cause_added', 'corrective_action_added', 'evidence_attached', 'resolved', 'reopened', 'closed')),
  description text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON public.incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON public.incident_timeline(incident_id, created_at);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_timeline ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view incidents
DROP POLICY IF EXISTS "Incidents viewable by all authenticated" ON public.incidents;
CREATE POLICY "Incidents viewable by all authenticated"
  ON public.incidents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Incident timeline viewable by all authenticated" ON public.incident_timeline;
CREATE POLICY "Incident timeline viewable by all authenticated"
  ON public.incident_timeline FOR SELECT
  TO authenticated
  USING (true);

-- Admin, compliance, finance can create/update incidents
DROP POLICY IF EXISTS "Incidents manageable by admin roles" ON public.incidents;
CREATE POLICY "Incidents manageable by admin roles"
  ON public.incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Incidents updatable by admin roles" ON public.incidents;
CREATE POLICY "Incidents updatable by admin roles"
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

-- Timeline entries manageable by admin roles
DROP POLICY IF EXISTS "Timeline manageable by admin roles" ON public.incident_timeline;
CREATE POLICY "Timeline manageable by admin roles"
  ON public.incident_timeline FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

-- Trigger: auto-update updated_at on incidents
CREATE OR REPLACE FUNCTION public.trigger_incidents_updated_at()
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

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON public.incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.trigger_incidents_updated_at();

-- RPAA Significant Incident auto-detection function
-- Called on insert/update to check if incident qualifies as RPAA-significant
CREATE OR REPLACE FUNCTION public.check_rpaa_significant_incident()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-flag as RPAA-significant if:
  -- - Service outage with high/critical severity
  -- - Security breach of any severity
  -- - Safeguarding failure
  -- - Large fraud event (> $10k or high/critical severity)
  IF NEW.category IN ('security_breach', 'safeguarding_failure') THEN
    NEW.is_rpaa_significant := true;
  ELSIF NEW.category = 'service_outage' AND NEW.severity IN ('high', 'critical') THEN
    NEW.is_rpaa_significant := true;
  ELSIF NEW.category = 'fraud_event' AND NEW.severity IN ('high', 'critical') THEN
    NEW.is_rpaa_significant := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rpaa_significant_incident ON public.incidents;
CREATE TRIGGER trg_rpaa_significant_incident
  BEFORE INSERT OR UPDATE OF category, severity ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.check_rpaa_significant_incident();

-- Auto-create timeline entry on incident creation
CREATE OR REPLACE FUNCTION public.incident_auto_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.incident_timeline (incident_id, event_type, description, user_id, metadata)
  VALUES (
    NEW.id,
    'created',
    'Incident created: ' || NEW.title,
    NEW.reported_by,
    jsonb_build_object('severity', NEW.severity, 'category', NEW.category)
  );

  IF NEW.is_rpaa_significant THEN
    INSERT INTO public.incident_timeline (incident_id, event_type, description, user_id, metadata)
    VALUES (
      NEW.id,
      'comment',
      '⚠ RPAA SIGNIFICANT INCIDENT — regulatory notification may be required.',
      NEW.reported_by,
      jsonb_build_object('auto_flagged', true)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_auto_timeline ON public.incidents;
CREATE TRIGGER trg_incident_auto_timeline
  AFTER INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.incident_auto_timeline();

REVOKE ALL ON FUNCTION public.trigger_incidents_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rpaa_significant_incident() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.incident_auto_timeline() FROM PUBLIC;