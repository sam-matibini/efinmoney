-- Admin-managed API credentials for Gemini (Alice), Plaid, and Resend.
-- Metadata is readable by admins. Secret values are service-role only.

CREATE TABLE IF NOT EXISTS public.system_api_providers (
  provider text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.system_api_secrets (
  provider text PRIMARY KEY REFERENCES public.system_api_providers(provider) ON DELETE CASCADE,
  secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_api_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_api_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read system api providers" ON public.system_api_providers;
CREATE POLICY "Admins read system api providers"
  ON public.system_api_providers
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

REVOKE ALL ON public.system_api_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.system_api_secrets TO service_role;
GRANT SELECT ON public.system_api_providers TO authenticated;
GRANT ALL ON public.system_api_providers TO service_role;

INSERT INTO public.system_api_providers (provider, label, description, is_enabled, public_config)
VALUES
  ('gemini', 'Gemini', 'Google Gemini API for the Alice AI assistant.', true, '{"model":"gemini-3.5-flash"}'::jsonb),
  ('plaid', 'Plaid', 'Bank linking, identity verification, and monitor screening.', true, '{"env":"production"}'::jsonb),
  ('resend', 'Resend', 'Transactional email, including KYC approval notices.', true, '{}'::jsonb)
ON CONFLICT (provider) DO NOTHING;
