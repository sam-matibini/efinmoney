-- Departments table: groups staff into organizational pools.
-- Each department can define its own permissions (AdminAction union).
-- Existing admin_users.department text column is replaced by FK reference.

CREATE TABLE IF NOT EXISTS public.departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed default departments
INSERT INTO public.departments (name, description, permissions) VALUES
  ('Compliance', 'KYC, AML, sanctions screening, regulatory reporting',
   '["approve_kyc","reject_kyc","request_info","escalate","edit_internal_notes","edit_users","edit_tiers"]'),
  ('Finance', 'Treasury, payouts, FX, reconciliation, billing',
   '["manage_finance","edit_settings"]'),
  ('Operations', 'Customer support, transaction monitoring, dispute resolution',
   '["view","edit_internal_notes"]'),
  ('Support', 'Customer-facing helpdesk and inquiries',
   '["view","edit_internal_notes"]'),
  ('Engineering', 'Platform development, integrations, infrastructure',
   '["view","edit_internal_notes","edit_settings"]'),
  ('Management', 'Executive oversight, full access',
   '["view","approve_kyc","reject_kyc","request_info","escalate","edit_internal_notes","edit_users","edit_tiers","manage_admins","manage_staff","manage_finance","edit_settings"]')
ON CONFLICT (name) DO NOTHING;

-- Enable RLS: staff can view departments, admins can manage them
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view departments"
  ON public.departments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND status = 'active'));

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.status = 'active' AND au.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.status = 'active' AND au.role = 'super_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
