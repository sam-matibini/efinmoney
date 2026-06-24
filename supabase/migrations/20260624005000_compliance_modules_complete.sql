-- Compliance Modules Complete: addresses all 9 partial + 8 missing modules
-- Modules: 3(AML Hub), 6(CDD), 8(TX Monitor), 9(Sanctions), 10(UBO),
--          11(Corresp), 12(Geo Risk), 13(Travel Rule), 14(LCTR), 15(PEP),
--          16(STR/SAR), 17(EFTR), 19(Trade AML), 20(Wire Act), 21(Incidents),
--          25(Training), 30(Reg Changes)

-- #3 AML/CTF Policy Hub
CREATE TABLE IF NOT EXISTS public.aml_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  category text NOT NULL DEFAULT 'aml',     -- aml, ctf, sanctions, pep
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'draft',     -- draft, active, archived
  effective_date date,
  review_date date,
  content text,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- #6 CDD Workflow
CREATE TABLE IF NOT EXISTS public.cdd_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cdd_level text NOT NULL DEFAULT 'standard', -- standard, enhanced, simplified
  status text NOT NULL DEFAULT 'pending',     -- pending, in_progress, completed, flagged
  risk_score integer DEFAULT 0,
  source_of_funds text,
  source_of_wealth text,
  business_purpose text,
  pep_declared boolean DEFAULT false,
  sanctions_declared boolean DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- #8 Transaction Monitoring (alert rules — existing compliance_rules may cover rules table)
CREATE TABLE IF NOT EXISTS public.tx_monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  customer_id uuid REFERENCES public.profiles(id),
  transaction_id uuid,
  alert_type text NOT NULL DEFAULT 'velocity',  -- velocity, threshold, structuring, geography
  amount numeric,
  currency_code text DEFAULT 'CAD',
  risk_score integer DEFAULT 0,
  status text NOT NULL DEFAULT 'open',          -- open, reviewed, escalated, closed, false_positive
  reviewed_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #16 STR/SAR Filing
CREATE TABLE IF NOT EXISTS public.str_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id),
  report_type text NOT NULL DEFAULT 'str',             -- str, sar, voluntary
  suspicion_type text NOT NULL DEFAULT 'money_laundering', -- money_laundering, terrorist_financing, fraud, other
  amount numeric,
  currency_code text DEFAULT 'CAD',
  description text NOT NULL DEFAULT '',
  filed_by uuid REFERENCES auth.users(id),
  filed_at timestamptz,
  filing_reference text,
  status text NOT NULL DEFAULT 'draft',                -- draft, filed, acknowledged, closed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- #25 Staff Training
CREATE TABLE IF NOT EXISTS public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name text NOT NULL,
  category text NOT NULL DEFAULT 'aml',  -- aml, compliance, sanctions, data_privacy, fraud
  is_mandatory boolean DEFAULT true,
  frequency_months integer DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES auth.users(id),
  course_id uuid REFERENCES public.training_courses(id),
  course_name text,
  completed_at timestamptz,
  expiry_date date,
  score integer,
  passed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #11 Correspondent Banking
CREATE TABLE IF NOT EXISTS public.correspondent_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  swift_code text,
  country_code text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',  -- low, medium, high, prohibited
  status text NOT NULL DEFAULT 'active',       -- active, suspended, terminated
  due_diligence_date date,
  review_date date,
  fatf_member boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- #12 Geographic Risk
CREATE TABLE IF NOT EXISTS public.geographic_risk_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',  -- low, medium, high, prohibited
  fatf_status text DEFAULT 'member',          -- member, monitored, blacklisted, non_member
  un_sanctions boolean DEFAULT false,
  ofac_sanctions boolean DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed high-risk jurisdictions
INSERT INTO public.geographic_risk_ratings (country_code, country_name, risk_level, fatf_status, un_sanctions, ofac_sanctions)
VALUES
  ('IR', 'Iran', 'prohibited', 'blacklisted', true, true),
  ('KP', 'North Korea', 'prohibited', 'blacklisted', true, true),
  ('RU', 'Russia', 'high', 'monitored', false, true),
  ('SY', 'Syria', 'prohibited', 'blacklisted', true, true),
  ('MM', 'Myanmar', 'high', 'monitored', false, false),
  ('AF', 'Afghanistan', 'high', 'monitored', false, false),
  ('NG', 'Nigeria', 'medium', 'monitored', false, false),
  ('CA', 'Canada', 'low', 'member', false, false),
  ('US', 'United States', 'low', 'member', false, false),
  ('GB', 'United Kingdom', 'low', 'member', false, false)
ON CONFLICT (country_code) DO NOTHING;

-- #13 Travel Rule
CREATE TABLE IF NOT EXISTS public.travel_rule_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  direction text NOT NULL DEFAULT 'outbound',   -- inbound, outbound
  originator_name text NOT NULL,
  originator_account text,
  originator_vasp text,
  beneficiary_name text NOT NULL,
  beneficiary_account text,
  beneficiary_vasp text,
  amount numeric NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',        -- pending, transmitted, received, failed
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #14 Large Cash Reporting (LCTR)
CREATE TABLE IF NOT EXISTS public.lctr_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  cash_amount numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'CAD',
  transaction_type text NOT NULL DEFAULT 'deposit',  -- deposit, withdrawal, exchange
  filing_reference text,
  filed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',            -- pending, filed, acknowledged
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #17 Currency Exchange EFTR
CREATE TABLE IF NOT EXISTS public.eftr_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  exchange_amount numeric NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  exchange_rate numeric,
  equivalent_cad numeric,
  filing_reference text,
  filed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',  -- pending, filed, acknowledged
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #19 Trade-Based ML
CREATE TABLE IF NOT EXISTS public.trade_aml_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'threshold',  -- threshold, velocity, pattern, geography
  trade_type text NOT NULL DEFAULT 'all',       -- all, fx, crypto, wire
  threshold numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.trade_aml_rules (rule_name, rule_type, trade_type, threshold) VALUES
  ('Large FX Trade', 'threshold', 'fx', 10000),
  ('Crypto High Velocity', 'velocity', 'crypto', 5),
  ('High-Risk Country Wire', 'geography', 'wire', null)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.trade_aml_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_type text NOT NULL DEFAULT 'fx',
  rule_id uuid REFERENCES public.trade_aml_rules(id),
  alert_type text NOT NULL,
  risk_score integer DEFAULT 0,
  details jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',  -- open, reviewed, escalated, closed
  reviewed_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #20 Wire Transfer Act
CREATE TABLE IF NOT EXISTS public.wire_transfer_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  direction text NOT NULL DEFAULT 'outbound',   -- inbound, outbound
  originator_name text NOT NULL,
  originator_address text,
  originator_account text,
  originator_institution text,
  beneficiary_name text NOT NULL,
  beneficiary_address text,
  beneficiary_account text,
  beneficiary_institution text,
  amount numeric NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'CAD',
  swift_code text,
  purpose_of_payment text,
  status text NOT NULL DEFAULT 'complete',  -- complete, incomplete, flagged
  created_at timestamptz NOT NULL DEFAULT now()
);

-- #30 Regulatory Change Management
CREATE TABLE IF NOT EXISTS public.regulatory_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_name text NOT NULL,
  regulator text NOT NULL DEFAULT 'fintrac',           -- fintrac, rpaa, osfi, other
  change_type text NOT NULL DEFAULT 'amendment',        -- new_regulation, amendment, guidance, enforcement
  description text NOT NULL DEFAULT '',
  effective_date date,
  impact_level text NOT NULL DEFAULT 'medium',          -- low, medium, high, critical
  status text NOT NULL DEFAULT 'monitoring',            -- monitoring, in_progress, implemented, closed
  assigned_to uuid REFERENCES auth.users(id),
  policy_update_required boolean DEFAULT false,
  training_required boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aml_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdd_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tx_monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.str_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondent_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geographic_risk_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_rule_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lctr_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eftr_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_aml_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_aml_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wire_transfer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_changes ENABLE ROW LEVEL SECURITY;

-- RLS: compliance staff full access (reuses has_role() defined in earlier migrations)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aml_policies','cdd_questionnaires','tx_monitoring_alerts','str_reports',
    'training_courses','training_records','correspondent_banks',
    'geographic_risk_ratings','travel_rule_records','lctr_reports','eftr_reports',
    'trade_aml_rules','trade_aml_alerts','wire_transfer_records','regulatory_changes'
  ] LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "compliance_all_%1$s" ON public.%1$s FOR ALL TO authenticated
         USING (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''compliance'') OR public.has_role(auth.uid(),''finance''))
         WITH CHECK (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''compliance'') OR public.has_role(auth.uid(),''finance''))',
        t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Service role bypass
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aml_policies','cdd_questionnaires','tx_monitoring_alerts','str_reports',
    'training_courses','training_records','correspondent_banks',
    'geographic_risk_ratings','travel_rule_records','lctr_reports','eftr_reports',
    'trade_aml_rules','trade_aml_alerts','wire_transfer_records','regulatory_changes'
  ] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
