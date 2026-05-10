-- ============== ENUMS ==============
CREATE TYPE public.kyc_verification_status AS ENUM ('not_started','in_progress','pending_review','approved','rejected','expired');
CREATE TYPE public.kyc_current_step AS ENUM ('identity','address','liveness','completed');
CREATE TYPE public.kyc_id_doc_type AS ENUM ('passport','drivers_license','national_id');
CREATE TYPE public.kyc_doc_review_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.kyc_address_doc_type AS ENUM ('utility_bill','bank_statement','tax_document','lease_agreement');
CREATE TYPE public.user_risk_tier AS ENUM ('tier_1','tier_2','tier_3','tier_4');
CREATE TYPE public.account_status_enum AS ENUM ('pending_verification','active','suspended','closed');
CREATE TYPE public.admin_user_role AS ENUM ('super_admin','compliance_officer','support_agent','viewer');

-- ============== KYC VERIFICATIONS ==============
CREATE TABLE public.kyc_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_status public.kyc_verification_status NOT NULL DEFAULT 'not_started',
  current_step public.kyc_current_step NOT NULL DEFAULT 'identity',
  id_document_type public.kyc_id_doc_type,
  id_document_url text,
  id_document_country text,
  id_verification_status public.kyc_doc_review_status NOT NULL DEFAULT 'pending',
  id_rejection_reason text,
  address_document_type public.kyc_address_doc_type,
  address_document_url text,
  address_verification_status public.kyc_doc_review_status NOT NULL DEFAULT 'pending',
  address_rejection_reason text,
  selfie_url text,
  liveness_check_status public.kyc_doc_review_status NOT NULL DEFAULT 'pending',
  persona_inquiry_id text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============== USER RISK TIERS ==============
CREATE TABLE public.user_risk_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  current_tier public.user_risk_tier NOT NULL DEFAULT 'tier_1',
  daily_transaction_limit numeric NOT NULL DEFAULT 100,
  monthly_transaction_limit numeric NOT NULL DEFAULT 1000,
  single_transaction_limit numeric NOT NULL DEFAULT 100,
  features_enabled jsonb NOT NULL DEFAULT '{"receive": true, "send": false, "international": false, "virtual_card": false}'::jsonb,
  upgraded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============== EXTEND EXISTING profiles TABLE ==============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS account_status public.account_status_enum NOT NULL DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS kyc_completed_at timestamptz;

-- Prevent users from changing account_number once set
CREATE OR REPLACE FUNCTION public.protect_account_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.account_number IS NOT NULL AND NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    -- Allow only when no auth context (system) or admin
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'account_number is read-only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_account_number
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_account_number();

-- ============== ADMIN USERS ==============
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.admin_user_role NOT NULL DEFAULT 'viewer',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.is_kyc_reviewer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _uid AND role IN ('super_admin','compliance_officer')
  );
$$;

-- ============== KYC AUDIT LOG ==============
CREATE TABLE public.kyc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_verification_id uuid NOT NULL REFERENCES public.kyc_verifications(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============== updated_at trigger (reuse existing fn) ==============
CREATE TRIGGER set_updated_at_kyc_verifications BEFORE UPDATE ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_user_risk_tiers BEFORE UPDATE ON public.user_risk_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_admin_users BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== RLS ==============
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_risk_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_audit_log ENABLE ROW LEVEL SECURITY;

-- kyc_verifications policies
CREATE POLICY "Users view own kyc" ON public.kyc_verifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));
CREATE POLICY "Users update own kyc" ON public.kyc_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_kyc_reviewer(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_kyc_reviewer(auth.uid()));
CREATE POLICY "Users insert own kyc" ON public.kyc_verifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins delete kyc" ON public.kyc_verifications
  FOR DELETE TO authenticated USING (public.is_admin_user(auth.uid()));

-- user_risk_tiers policies
CREATE POLICY "Users view own risk tier" ON public.user_risk_tiers
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));
CREATE POLICY "Users update own risk tier" ON public.user_risk_tiers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin_user(auth.uid()));
CREATE POLICY "Users insert own risk tier" ON public.user_risk_tiers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- admin_users policies
CREATE POLICY "Admins view admin_users" ON public.admin_users
  FOR SELECT TO authenticated USING (public.is_admin_user(auth.uid()));
CREATE POLICY "Super admins manage admin_users" ON public.admin_users
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin'));

-- kyc_audit_log policies (admins read; system writes via SECURITY DEFINER triggers)
CREATE POLICY "Admins read audit log" ON public.kyc_audit_log
  FOR SELECT TO authenticated USING (public.is_admin_user(auth.uid()));

-- ============== STORAGE BUCKET ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents','kyc-documents', false, 10485760,
  ARRAY['image/jpeg','image/png','image/jpg','application/pdf']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users upload to own kyc folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('identity','address')
  );
CREATE POLICY "Users view own kyc files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_user(auth.uid()))
  );
CREATE POLICY "Users update own kyc files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own kyc files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'kyc-documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_user(auth.uid())));

-- ============== generate_account_number ==============
CREATE OR REPLACE FUNCTION public.generate_account_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_candidate text;
  v_exists boolean;
  v_attempts int := 0;
BEGIN
  LOOP
    v_candidate := '10' || lpad((floor(random() * 100000000))::int::text, 8, '0');
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE account_number = v_candidate) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique account number';
    END IF;
  END LOOP;
  RETURN v_candidate;
END;
$$;

-- ============== on_kyc_status_change TRIGGER ==============
CREATE OR REPLACE FUNCTION public.on_kyc_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acct text;
  v_has_acct text;
BEGIN
  IF NEW.verification_status = 'approved'
     AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN

    -- Tier upgrade
    IF NEW.id_verification_status = 'approved' AND NEW.address_verification_status = 'approved' THEN
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id,'tier_3',50000,500000,50000,
              '{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier='tier_3',
        daily_transaction_limit=50000,
        monthly_transaction_limit=500000,
        single_transaction_limit=50000,
        features_enabled='{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb,
        upgraded_at=now(),
        updated_at=now();
    ELSIF NEW.id_verification_status = 'approved' THEN
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id,'tier_2',5000,50000,5000,
              '{"receive": true, "send": true, "international": false, "virtual_card": false}'::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier='tier_2',
        daily_transaction_limit=5000,
        monthly_transaction_limit=50000,
        single_transaction_limit=5000,
        features_enabled='{"receive": true, "send": true, "international": false, "virtual_card": false}'::jsonb,
        upgraded_at=now(),
        updated_at=now();
    END IF;

    -- Account number + status
    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number = v_acct,
            account_status = 'active',
            kyc_completed_at = now()
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now())
        WHERE user_id = NEW.user_id;
    END IF;

    -- Audit log
    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text, NULL);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_kyc_status_change
  AFTER UPDATE ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.on_kyc_status_change();

-- ============== Extend handle_new_user (signup) ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, account_status)
    VALUES (NEW.id, NEW.email, 'pending_verification')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'USD', true),
        (NEW.id, 'CAD', false);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    INSERT INTO public.user_risk_tiers (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.kyc_verifications (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;

    PERFORM public.invoke_send_email(
      'welcome',
      NEW.email,
      jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    );

    RETURN NEW;
END;
$$;

-- Backfill kyc/risk records for existing users
INSERT INTO public.user_risk_tiers (user_id)
SELECT user_id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.kyc_verifications (user_id)
SELECT user_id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;