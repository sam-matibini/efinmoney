CREATE TABLE IF NOT EXISTS public.partner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  role_type text NOT NULL DEFAULT 'commercial',
  email text,
  phone text,
  phone_alt text,
  timezone text,
  preferred_channel text DEFAULT 'email',
  is_primary boolean NOT NULL DEFAULT false,
  escalation_order integer,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_contacts TO authenticated;
GRANT ALL ON public.partner_contacts TO service_role;
ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_contacts' AND policyname='Admins manage partner contacts') THEN
    CREATE POLICY "Admins manage partner contacts" ON public.partner_contacts FOR ALL TO authenticated
      USING (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()))
      WITH CHECK (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner ON public.partner_contacts(partner_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_partner_contacts_updated_at') THEN
    CREATE TRIGGER update_partner_contacts_updated_at BEFORE UPDATE ON public.partner_contacts
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  address_type text NOT NULL DEFAULT 'registered',
  line1 text,
  line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_addresses TO authenticated;
GRANT ALL ON public.partner_addresses TO service_role;
ALTER TABLE public.partner_addresses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_addresses' AND policyname='Admins manage partner addresses') THEN
    CREATE POLICY "Admins manage partner addresses" ON public.partner_addresses FOR ALL TO authenticated
      USING (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()))
      WITH CHECK (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_partner_addresses_partner ON public.partner_addresses(partner_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_partner_addresses_updated_at') THEN
    CREATE TRIGGER update_partner_addresses_updated_at BEFORE UPDATE ON public.partner_addresses
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'agreement',
  title text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  version text,
  status text NOT NULL DEFAULT 'executed',
  signed_date date,
  effective_date date,
  expiry_date date,
  counterparty_signer text,
  superseded_by uuid REFERENCES public.partner_documents(id) ON DELETE SET NULL,
  uploaded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_documents TO authenticated;
GRANT ALL ON public.partner_documents TO service_role;
ALTER TABLE public.partner_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_documents' AND policyname='Admins manage partner documents') THEN
    CREATE POLICY "Admins manage partner documents" ON public.partner_documents FOR ALL TO authenticated
      USING (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()))
      WITH CHECK (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_partner_documents_partner ON public.partner_documents(partner_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_partner_documents_updated_at') THEN
    CREATE TRIGGER update_partner_documents_updated_at BEFORE UPDATE ON public.partner_documents
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note',
  subject text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid REFERENCES public.partner_contacts(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.partner_documents(id) ON DELETE SET NULL,
  follow_up_at timestamptz,
  follow_up_owner text,
  follow_up_done boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_crm_activities TO authenticated;
GRANT ALL ON public.partner_crm_activities TO service_role;
ALTER TABLE public.partner_crm_activities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_crm_activities' AND policyname='Admins manage partner crm activities') THEN
    CREATE POLICY "Admins manage partner crm activities" ON public.partner_crm_activities FOR ALL TO authenticated
      USING (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()))
      WITH CHECK (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_partner_crm_activities_partner ON public.partner_crm_activities(partner_id, occurred_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_partner_crm_activities_updated_at') THEN
    CREATE TRIGGER update_partner_crm_activities_updated_at BEFORE UPDATE ON public.partner_crm_activities
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins read partner document files') THEN
    CREATE POLICY "Admins read partner document files" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'partner-documents' AND (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid())));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins upload partner document files') THEN
    CREATE POLICY "Admins upload partner document files" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'partner-documents' AND (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid())));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins update partner document files') THEN
    CREATE POLICY "Admins update partner document files" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'partner-documents' AND (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid())));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins delete partner document files') THEN
    CREATE POLICY "Admins delete partner document files" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'partner-documents' AND (public.is_admin_user(auth.uid()) OR public.is_pricing_manager(auth.uid())));
  END IF;
END $$;
