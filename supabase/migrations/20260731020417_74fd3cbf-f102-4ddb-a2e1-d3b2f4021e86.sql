CREATE TABLE public.api_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  status text NOT NULL DEFAULT 'active',
  tier text NOT NULL DEFAULT 'standard',
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  allowed_endpoints text[] NOT NULL DEFAULT ARRAY['rates','corridors','quote'],
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.api_partner_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.api_partners(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_partner_keys_partner ON public.api_partner_keys(partner_id);

CREATE TABLE public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.api_partners(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.api_partner_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code integer NOT NULL,
  latency_ms integer,
  ip text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_request_logs_partner_created ON public.api_request_logs(partner_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_partners TO authenticated;
GRANT ALL ON public.api_partners TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_partner_keys TO authenticated;
GRANT ALL ON public.api_partner_keys TO service_role;
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;

ALTER TABLE public.api_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_partner_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage api partners" ON public.api_partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage api partner keys" ON public.api_partner_keys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read api request logs" ON public.api_request_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_api_partners_updated_at BEFORE UPDATE ON public.api_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_api_partner_keys_updated_at BEFORE UPDATE ON public.api_partner_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.verify_api_key(p_hash text)
RETURNS TABLE (
  key_id uuid,
  partner_id uuid,
  partner_name text,
  status text,
  tier text,
  rate_limit_per_min integer,
  allowed_endpoints text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id, p.id, p.name, p.status, p.tier, p.rate_limit_per_min, p.allowed_endpoints
  FROM public.api_partner_keys k
  JOIN public.api_partners p ON p.id = k.partner_id
  WHERE k.key_hash = p_hash AND k.revoked_at IS NULL
  LIMIT 1;
$$;