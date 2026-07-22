-- KYB / SME onboarding.
-- A business is an entity owned by a founder's user_id. Wallets stay keyed to
-- user_id for v1 -- the ledger does not move. Verification is manual document
-- review by compliance staff (no third-party KYB vendor in v1).

-- ============== ENUMS ==============
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyb_status') THEN
  CREATE TYPE public.kyb_status AS ENUM ('not_started','in_progress','pending_review','approved','rejected','suspended');
END IF; END $do$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyb_step') THEN
  CREATE TYPE public.kyb_step AS ENUM ('details','ownership','documents','review','completed');
END IF; END $do$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyb_tier') THEN
  CREATE TYPE public.kyb_tier AS ENUM ('kyb_0','kyb_1','kyb_2');
END IF; END $do$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_entity_type') THEN
  CREATE TYPE public.business_entity_type AS ENUM (
    'sole_proprietorship','partnership','corporation','llc','ngo','cooperative','trust','other'
  );
END IF; END $do$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_owner_role') THEN
  CREATE TYPE public.business_owner_role AS ENUM ('beneficial_owner','director','signing_officer','senior_officer');
END IF; END $do$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyb_doc_status') THEN
  CREATE TYPE public.kyb_doc_status AS ENUM ('pending','approved','rejected');
END IF; END $do$;

-- ============== business_profiles ==============
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,

  legal_name text NOT NULL,
  operating_name text,
  entity_type business_entity_type NOT NULL,
  registration_number text,
  tax_id text,
  date_of_incorporation date,
  incorporation_country varchar(2) NOT NULL,
  incorporation_region text,                       -- province/state, needed for CA/NG registries

  industry text,
  naics_code varchar(10),
  website text,
  business_phone varchar(50),
  business_email varchar(255),
  expected_monthly_volume numeric(20,2),
  source_of_funds text,

  -- registered address
  street_address text,
  city text,
  state_province text,
  postal_code text,
  address_country varchar(2),

  -- operating address (nullable = same as registered)
  op_street_address text,
  op_city text,
  op_state_province text,
  op_postal_code text,
  op_address_country varchar(2),

  kyb_status kyb_status NOT NULL DEFAULT 'not_started',
  current_step kyb_step NOT NULL DEFAULT 'details',
  kyb_tier kyb_tier NOT NULL DEFAULT 'kyb_0',
  risk_level text NOT NULL DEFAULT 'medium',
  rejection_reason text,

  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,

  aml_status aml_profile_status NOT NULL DEFAULT 'unscreened',
  aml_last_screened_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_profiles_risk_level_chk CHECK (risk_level IN ('low','medium','high')),
  -- one business per founder in v1; lifted when multi-entity ownership lands
  CONSTRAINT business_profiles_owner_user_id_key UNIQUE (owner_user_id)
);

ALTER TABLE public.business_profiles DROP CONSTRAINT IF EXISTS business_profiles_owner_user_id_fkey;
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_profiles_status ON public.business_profiles (kyb_status);
CREATE INDEX IF NOT EXISTS idx_business_profiles_submitted ON public.business_profiles (submitted_at DESC NULLS LAST);

-- Explicit GRANTs (RLS alone is not enough -- writes 42501 without these)
GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
GRANT ALL ON public.business_profiles TO service_role;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

-- ============== business_owners (UBOs, directors, signing officers) ==============
CREATE TABLE IF NOT EXISTS public.business_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL,

  full_name text NOT NULL,
  date_of_birth date,
  role business_owner_role NOT NULL DEFAULT 'beneficial_owner',
  ownership_percent numeric(5,2) NOT NULL DEFAULT 0,
  nationality varchar(2),
  occupation text,
  is_pep boolean NOT NULL DEFAULT false,

  street_address text,
  city text,
  state_province text,
  postal_code text,
  address_country varchar(2),

  email varchar(255),
  phone varchar(50),

  -- links a UBO to the existing individual KYC pipeline when they hold an account
  kyc_verification_id uuid,
  user_id uuid,

  verification_status kyb_doc_status NOT NULL DEFAULT 'pending',
  rejection_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_owners_ownership_range_chk
    CHECK (ownership_percent >= 0 AND ownership_percent <= 100)
);

ALTER TABLE public.business_owners DROP CONSTRAINT IF EXISTS business_owners_business_profile_id_fkey;
ALTER TABLE public.business_owners ADD CONSTRAINT business_owners_business_profile_id_fkey
  FOREIGN KEY (business_profile_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.business_owners DROP CONSTRAINT IF EXISTS business_owners_kyc_verification_id_fkey;
ALTER TABLE public.business_owners ADD CONSTRAINT business_owners_kyc_verification_id_fkey
  FOREIGN KEY (kyc_verification_id) REFERENCES public.kyc_verifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_owners_profile ON public.business_owners (business_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_owners TO authenticated;
GRANT ALL ON public.business_owners TO service_role;
ALTER TABLE public.business_owners ENABLE ROW LEVEL SECURITY;

-- ============== business_documents ==============
CREATE TABLE IF NOT EXISTS public.business_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL,
  business_owner_id uuid,                          -- set when the doc belongs to a UBO
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  mime_type text,
  status kyb_doc_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_documents DROP CONSTRAINT IF EXISTS business_documents_business_profile_id_fkey;
ALTER TABLE public.business_documents ADD CONSTRAINT business_documents_business_profile_id_fkey
  FOREIGN KEY (business_profile_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.business_documents DROP CONSTRAINT IF EXISTS business_documents_business_owner_id_fkey;
ALTER TABLE public.business_documents ADD CONSTRAINT business_documents_business_owner_id_fkey
  FOREIGN KEY (business_owner_id) REFERENCES public.business_owners(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_documents_profile ON public.business_documents (business_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_documents TO authenticated;
GRANT ALL ON public.business_documents TO service_role;
ALTER TABLE public.business_documents ENABLE ROW LEVEL SECURITY;

-- ============== business_kyb_audit_log ==============
CREATE TABLE IF NOT EXISTS public.business_kyb_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL,
  admin_id uuid,
  action text NOT NULL,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_kyb_audit_log DROP CONSTRAINT IF EXISTS business_kyb_audit_log_business_profile_id_fkey;
ALTER TABLE public.business_kyb_audit_log ADD CONSTRAINT business_kyb_audit_log_business_profile_id_fkey
  FOREIGN KEY (business_profile_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_kyb_audit_profile
  ON public.business_kyb_audit_log (business_profile_id, created_at DESC);

GRANT SELECT ON public.business_kyb_audit_log TO authenticated;
GRANT ALL ON public.business_kyb_audit_log TO service_role;
ALTER TABLE public.business_kyb_audit_log ENABLE ROW LEVEL SECURITY;

-- ============== business_tier_limits ==============
CREATE TABLE IF NOT EXISTS public.business_tier_limits (
  tier kyb_tier PRIMARY KEY,
  label text NOT NULL,
  max_balance numeric NOT NULL,
  daily_limit numeric NOT NULL,
  monthly_limit numeric NOT NULL,
  single_limit numeric NOT NULL,
  features_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_tier_limits TO authenticated;
GRANT ALL ON public.business_tier_limits TO service_role;
ALTER TABLE public.business_tier_limits ENABLE ROW LEVEL SECURITY;

INSERT INTO public.business_tier_limits (tier, label, max_balance, daily_limit, monthly_limit, single_limit, features_enabled)
VALUES
  ('kyb_0', 'Unverified business', 0, 0, 0, 0,
   '{"receive": false, "send": false, "international": false, "payouts": false}'::jsonb),
  ('kyb_1', 'Verified business', 100000, 25000, 250000, 25000,
   '{"receive": true, "send": true, "international": false, "payouts": true}'::jsonb),
  ('kyb_2', 'Enhanced business', 1000000, 250000, 2500000, 250000,
   '{"receive": true, "send": true, "international": true, "payouts": true}'::jsonb)
ON CONFLICT (tier) DO NOTHING;

-- ============== kyb_document_requirements (data-driven doc matrix) ==============
-- Adding a jurisdiction is a row insert, not a code change.
CREATE TABLE IF NOT EXISTS public.kyb_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country varchar(2) NOT NULL,
  entity_type business_entity_type,                -- NULL = applies to every entity type
  document_type text NOT NULL,
  label text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'business',     -- 'business' | 'owner'
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT kyb_doc_req_applies_to_chk CHECK (applies_to IN ('business','owner')),
  CONSTRAINT kyb_doc_req_unique UNIQUE (country, entity_type, document_type, applies_to)
);

GRANT SELECT ON public.kyb_document_requirements TO authenticated;
GRANT ALL ON public.kyb_document_requirements TO service_role;
ALTER TABLE public.kyb_document_requirements ENABLE ROW LEVEL SECURITY;

INSERT INTO public.kyb_document_requirements
  (country, entity_type, document_type, label, description, is_required, applies_to, sort_order)
VALUES
  -- Canada
  ('CA', NULL, 'registration_certificate', 'Certificate of Incorporation / Registration',
   'Issued by Corporations Canada or the provincial registry.', true, 'business', 10),
  ('CA', NULL, 'articles_of_incorporation', 'Articles of Incorporation',
   'Including any amendments.', true, 'business', 20),
  ('CA', NULL, 'proof_of_business_address', 'Proof of Business Address',
   'Utility bill, lease, or bank statement dated within 90 days.', true, 'business', 30),
  ('CA', NULL, 'ownership_chart', 'Ownership / Control Structure',
   'Shows every individual owning 25% or more.', true, 'business', 40),
  ('CA', NULL, 'bank_statement', 'Business Bank Statement',
   'Most recent statement, dated within 90 days.', false, 'business', 50),
  ('CA', 'sole_proprietorship', 'business_name_registration', 'Business Name Registration',
   'Master Business Licence or provincial equivalent.', true, 'business', 15),
  ('CA', NULL, 'owner_government_id', 'Government-issued Photo ID',
   'Passport, driver''s licence, or provincial ID.', true, 'owner', 10),
  ('CA', NULL, 'owner_proof_of_address', 'Proof of Personal Address',
   'Dated within 90 days.', true, 'owner', 20),

  -- Nigeria
  ('NG', NULL, 'registration_certificate', 'CAC Certificate of Incorporation',
   'Issued by the Corporate Affairs Commission.', true, 'business', 10),
  ('NG', NULL, 'cac_status_report', 'CAC Status Report',
   'Replaces forms CAC 1.1 / CO7. Lists directors and shareholders.', true, 'business', 20),
  ('NG', NULL, 'proof_of_business_address', 'Proof of Business Address',
   'Utility bill or tenancy agreement dated within 90 days.', true, 'business', 30),
  ('NG', NULL, 'tin_certificate', 'Tax Identification Number (TIN) Certificate',
   'Issued by FIRS.', true, 'business', 40),
  ('NG', NULL, 'ownership_chart', 'Ownership / Control Structure',
   'Shows every individual owning 25% or more.', true, 'business', 50),
  ('NG', NULL, 'owner_government_id', 'Government-issued Photo ID',
   'International passport, NIN slip, driver''s licence, or voter''s card.', true, 'owner', 10),
  ('NG', NULL, 'owner_bvn', 'Bank Verification Number (BVN)',
   'BVN slip or bank confirmation.', true, 'owner', 20),
  ('NG', NULL, 'owner_proof_of_address', 'Proof of Personal Address',
   'Dated within 90 days.', true, 'owner', 30)
ON CONFLICT (country, entity_type, document_type, applies_to) DO NOTHING;

-- ============== helper: does this user own this business? ==============
CREATE OR REPLACE FUNCTION public.owns_business(_user_id uuid, _business_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_profiles
    WHERE id = _business_profile_id AND owner_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_kyb_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'compliance'::app_role);
$$;

GRANT EXECUTE ON FUNCTION public.owns_business(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kyb_reviewer(uuid) TO authenticated;

-- ============== RLS POLICIES ==============

-- business_profiles: founder reads/writes own; reviewers read all; only the
-- trigger/service_role may set 'approved'.
DROP POLICY IF EXISTS "business_profiles_select_own" ON public.business_profiles;
CREATE POLICY "business_profiles_select_own" ON public.business_profiles
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_kyb_reviewer(auth.uid()));

DROP POLICY IF EXISTS "business_profiles_insert_own" ON public.business_profiles;
CREATE POLICY "business_profiles_insert_own" ON public.business_profiles
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND kyb_status IN ('not_started','in_progress'));

-- Founder may edit only while the application is still theirs to edit, and may
-- never move the row into an approved state. Reviewers may update anything.
DROP POLICY IF EXISTS "business_profiles_update_own" ON public.business_profiles;
CREATE POLICY "business_profiles_update_own" ON public.business_profiles
  FOR UPDATE TO authenticated
  USING (
    (owner_user_id = auth.uid() AND kyb_status IN ('not_started','in_progress','rejected'))
    OR public.is_kyb_reviewer(auth.uid())
  )
  WITH CHECK (
    (owner_user_id = auth.uid()
      AND kyb_status IN ('not_started','in_progress','pending_review')
      AND kyb_tier = 'kyb_0')
    OR public.is_kyb_reviewer(auth.uid())
  );

-- business_owners
DROP POLICY IF EXISTS "business_owners_select" ON public.business_owners;
CREATE POLICY "business_owners_select" ON public.business_owners
  FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

DROP POLICY IF EXISTS "business_owners_write" ON public.business_owners;
CREATE POLICY "business_owners_write" ON public.business_owners
  FOR ALL TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

-- business_documents
DROP POLICY IF EXISTS "business_documents_select" ON public.business_documents;
CREATE POLICY "business_documents_select" ON public.business_documents
  FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

DROP POLICY IF EXISTS "business_documents_insert" ON public.business_documents;
CREATE POLICY "business_documents_insert" ON public.business_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

DROP POLICY IF EXISTS "business_documents_update" ON public.business_documents;
CREATE POLICY "business_documents_update" ON public.business_documents
  FOR UPDATE TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

DROP POLICY IF EXISTS "business_documents_delete_own" ON public.business_documents;
CREATE POLICY "business_documents_delete_own" ON public.business_documents
  FOR DELETE TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) AND status = 'pending');

-- business_kyb_audit_log: read-only to founder + reviewers, written by trigger/service_role
DROP POLICY IF EXISTS "business_kyb_audit_select" ON public.business_kyb_audit_log;
CREATE POLICY "business_kyb_audit_select" ON public.business_kyb_audit_log
  FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_profile_id) OR public.is_kyb_reviewer(auth.uid()));

-- reference tables: readable by all authenticated
DROP POLICY IF EXISTS "business_tier_limits_select" ON public.business_tier_limits;
CREATE POLICY "business_tier_limits_select" ON public.business_tier_limits
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kyb_document_requirements_select" ON public.kyb_document_requirements;
CREATE POLICY "kyb_document_requirements_select" ON public.kyb_document_requirements
  FOR SELECT TO authenticated USING (true);

-- ============== updated_at triggers ==============
DROP TRIGGER IF EXISTS business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS business_owners_updated_at ON public.business_owners;
CREATE TRIGGER business_owners_updated_at
  BEFORE UPDATE ON public.business_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS business_tier_limits_updated_at ON public.business_tier_limits;
CREATE TRIGGER business_tier_limits_updated_at
  BEFORE UPDATE ON public.business_tier_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== STORAGE ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-documents',
  'business-documents',
  false,
  15728640,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <owner_user_id>/<business_profile_id>/<document_type>-<ts>.<ext>
DROP POLICY IF EXISTS "business_docs_insert" ON storage.objects;
CREATE POLICY "business_docs_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "business_docs_select" ON storage.objects;
CREATE POLICY "business_docs_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'business-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','compliance')
    )
  )
);

DROP POLICY IF EXISTS "business_docs_delete_own" ON storage.objects;
CREATE POLICY "business_docs_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'business-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
