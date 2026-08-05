-- =====================================================================
-- eFinMoney — Complete Public Schema (regenerated from live database)
-- =====================================================================
-- This file recreates the entire public schema, including all 97 tables,
-- their constraints, indexes, RLS policies, custom enums, functions, and
-- triggers. Statements are idempotent where possible.
--
-- Order of execution:
--   1. Required extensions
--   2. Custom enums
--   3. Tables (with PRIMARY KEY / UNIQUE / CHECK inline, GRANTs, RLS ENABLE)
--   4. Foreign key constraints (added after all tables exist)
--   5. Secondary indexes
--   6. Database functions (security-definer helpers, ledger, AML, etc.)
--   7. Triggers
--   8. Row-Level Security policies
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================================
-- 2. CUSTOM ENUMS
-- =====================================================================

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN CREATE TYPE public.account_status_enum AS ENUM ('pending_verification', 'active', 'suspended', 'closed'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'income', 'expense', 'equity'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_user_role') THEN CREATE TYPE public.admin_user_role AS ENUM ('super_admin', 'compliance_officer', 'support_agent', 'viewer'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN CREATE TYPE public.alert_severity AS ENUM ('low', 'medium', 'high', 'critical'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN CREATE TYPE public.alert_status AS ENUM ('open', 'investigating', 'escalated', 'resolved', 'false_positive'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_entity_type') THEN CREATE TYPE public.aml_entity_type AS ENUM ('individual', 'entity', 'vessel', 'aircraft', 'unknown'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_match_disposition') THEN CREATE TYPE public.aml_match_disposition AS ENUM ('pending', 'true_match', 'false_positive', 'escalated'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_profile_status') THEN CREATE TYPE public.aml_profile_status AS ENUM ('unscreened', 'clear', 'hit', 'review'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_screening_status') THEN CREATE TYPE public.aml_screening_status AS ENUM ('clear', 'hit', 'error'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_screening_trigger') THEN CREATE TYPE public.aml_screening_trigger AS ENUM ('kyc', 'transfer', 'p2p', 'manual', 'rescreen'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_source') THEN CREATE TYPE public.aml_source AS ENUM ('ofac', 'un', 'eu', 'uk', 'ca', 'pep'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'compliance', 'support', 'finance'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_card_role') THEN CREATE TYPE public.business_card_role AS ENUM ('owner', 'admin', 'member'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_authorization_status') THEN CREATE TYPE public.card_authorization_status AS ENUM ('pending', 'approved', 'declined', 'reversed', 'expired'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_fraud_severity') THEN CREATE TYPE public.card_fraud_severity AS ENUM ('low', 'medium', 'high', 'critical'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_funding_source') THEN CREATE TYPE public.card_funding_source AS ENUM ('wallet', 'eft'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_funding_status') THEN CREATE TYPE public.card_funding_status AS ENUM ('pending', 'completed', 'failed', 'reversed'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cardholder_status') THEN CREATE TYPE public.cardholder_status AS ENUM ('active', 'inactive', 'blocked'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cardholder_type') THEN CREATE TYPE public.cardholder_type AS ENUM ('individual', 'company'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_type') THEN CREATE TYPE public.currency_type AS ENUM ('fiat', 'crypto'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issued_card_purpose') THEN CREATE TYPE public.issued_card_purpose AS ENUM ('personal', 'business', 'single_use', 'subscription'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issued_card_status') THEN CREATE TYPE public.issued_card_status AS ENUM ('active', 'frozen', 'cancelled', 'pending'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issued_card_type') THEN CREATE TYPE public.issued_card_type AS ENUM ('virtual', 'physical'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_address_doc_type') THEN CREATE TYPE public.kyc_address_doc_type AS ENUM ('utility_bill', 'bank_statement', 'tax_document', 'lease_agreement'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_current_step') THEN CREATE TYPE public.kyc_current_step AS ENUM ('identity', 'address', 'liveness', 'completed'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_doc_review_status') THEN CREATE TYPE public.kyc_doc_review_status AS ENUM ('pending', 'approved', 'rejected'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_id_doc_type') THEN CREATE TYPE public.kyc_id_doc_type AS ENUM ('passport', 'drivers_license', 'national_id'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status') THEN CREATE TYPE public.kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected', 'expired'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_tier') THEN CREATE TYPE public.kyc_tier AS ENUM ('tier_0', 'tier_1', 'tier_2', 'tier_3'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_verification_status') THEN CREATE TYPE public.kyc_verification_status AS ENUM ('not_started', 'in_progress', 'pending_review', 'approved', 'rejected', 'expired'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN CREATE TYPE public.reconciliation_status AS ENUM ('pending', 'matched', 'unmatched', 'exception', 'resolved'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_filing_frequency') THEN CREATE TYPE public.tax_filing_frequency AS ENUM ('monthly', 'quarterly', 'annually'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_filing_status') THEN CREATE TYPE public.tax_filing_status AS ENUM ('draft', 'pending_review', 'approved', 'filed', 'paid'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tax_type') THEN CREATE TYPE public.tax_type AS ENUM ('GST', 'HST', 'QST', 'PST', 'RST'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_side') THEN CREATE TYPE public.trade_side AS ENUM ('buy', 'sell'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_status') THEN CREATE TYPE public.trade_status AS ENUM ('pending', 'executed', 'cancelled', 'failed'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN CREATE TYPE public.transfer_status AS ENUM ('initiated', 'funded', 'processing', 'completed', 'failed', 'reversed', 'expired'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_type') THEN CREATE TYPE public.transfer_type AS ENUM ('internal', 'mobile_money', 'bank', 'crypto', 'bill_payment', 'domestic_canada'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_risk_tier') THEN CREATE TYPE public.user_risk_tier AS ENUM ('tier_1', 'tier_2', 'tier_3', 'tier_4'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'virtual_account_status') THEN CREATE TYPE public.virtual_account_status AS ENUM ('active', 'inactive', 'expired'); END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_status') THEN CREATE TYPE public.wallet_status AS ENUM ('active', 'frozen', 'suspended', 'closed'); END IF; END $do$;


-- =====================================================================
-- 3. TABLES (PK / UNIQUE / CHECK inline; GRANTs + RLS ENABLE per table)
-- =====================================================================

-- TABLE: admin_notifications
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT admin_notifications_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- TABLE: admin_users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid NOT NULL,
  role admin_user_role DEFAULT 'viewer'::admin_user_role NOT NULL,
  permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  full_name text,
  CONSTRAINT admin_users_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- TABLE: aml_matches
CREATE TABLE IF NOT EXISTS public.aml_matches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  screening_id uuid NOT NULL,
  watchlist_id uuid NOT NULL,
  score numeric(5,4) NOT NULL,
  match_type text NOT NULL,
  disposition aml_match_disposition DEFAULT 'pending'::aml_match_disposition NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT aml_matches_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aml_matches TO authenticated;
GRANT ALL ON public.aml_matches TO service_role;
ALTER TABLE public.aml_matches ENABLE ROW LEVEL SECURITY;

-- TABLE: aml_screenings
CREATE TABLE IF NOT EXISTS public.aml_screenings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  trigger aml_screening_trigger NOT NULL,
  trigger_ref uuid,
  subject_name text NOT NULL,
  subject_dob date,
  subject_country text,
  status aml_screening_status DEFAULT 'clear'::aml_screening_status NOT NULL,
  match_count integer DEFAULT 0 NOT NULL,
  screened_by uuid,
  screened_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT aml_screenings_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aml_screenings TO authenticated;
GRANT ALL ON public.aml_screenings TO service_role;
ALTER TABLE public.aml_screenings ENABLE ROW LEVEL SECURITY;

-- TABLE: aml_watchlist
CREATE TABLE IF NOT EXISTS public.aml_watchlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source aml_source NOT NULL,
  source_id text NOT NULL,
  entity_type aml_entity_type DEFAULT 'individual'::aml_entity_type NOT NULL,
  name text NOT NULL,
  name_normalized text NOT NULL,
  aliases text[] DEFAULT '{}'::text[] NOT NULL,
  dob date,
  dob_year integer,
  nationalities text[] DEFAULT '{}'::text[] NOT NULL,
  countries text[] DEFAULT '{}'::text[] NOT NULL,
  programs text[] DEFAULT '{}'::text[] NOT NULL,
  remarks text,
  source_url text,
  raw jsonb,
  list_published_at timestamp with time zone,
  ingested_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT aml_watchlist_source_source_id_key UNIQUE (source, source_id),
  CONSTRAINT aml_watchlist_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aml_watchlist TO authenticated;
GRANT ALL ON public.aml_watchlist TO service_role;
ALTER TABLE public.aml_watchlist ENABLE ROW LEVEL SECURITY;

-- TABLE: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action character varying(100) NOT NULL,
  table_name character varying(100),
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- TABLE: bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_name character varying(255) NOT NULL,
  bank_name character varying(255) NOT NULL,
  account_number character varying(50) NOT NULL,
  routing_number character varying(50),
  swift_code character varying(20),
  currency_code character varying(10) NOT NULL,
  account_type character varying(50) DEFAULT 'trust'::character varying NOT NULL,
  ledger_account_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  last_reconciled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bank_accounts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bank_account_id uuid NOT NULL,
  transaction_date date NOT NULL,
  post_date date,
  description text NOT NULL,
  reference character varying(255),
  debit_amount numeric(20,8) DEFAULT 0,
  credit_amount numeric(20,8) DEFAULT 0,
  balance numeric(20,8),
  category character varying(100),
  raw_data jsonb,
  import_batch_id uuid,
  imported_at timestamp with time zone DEFAULT now() NOT NULL,
  is_categorized boolean DEFAULT false NOT NULL,
  is_posted boolean DEFAULT false NOT NULL,
  rule_id uuid,
  debit_account_id uuid,
  credit_account_id uuid,
  ai_confidence numeric(5,4),
  journal_id uuid,
  categorized_at timestamp with time zone,
  posted_at timestamp with time zone,
  CONSTRAINT bank_transactions_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- TABLE: beneficiaries
CREATE TABLE IF NOT EXISTS public.beneficiaries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  country_code text,
  payout_method text,
  network text,
  bank_name text,
  bank_account text,
  currency_code text,
  address text,
  tel text,
  nickname text,
  avatar_initials text,
  transfer_count integer DEFAULT 0 NOT NULL,
  last_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT beneficiaries_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT ALL ON public.beneficiaries TO service_role;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;

-- TABLE: bill_payments
CREATE TABLE IF NOT EXISTS public.bill_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  wallet_id uuid,
  category text NOT NULL,
  biller_code text NOT NULL,
  biller_name text,
  customer_identifier text NOT NULL,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) NOT NULL,
  fee numeric(20,2) DEFAULT 0 NOT NULL,
  reference text NOT NULL,
  flw_reference text,
  token text,
  units text,
  status text DEFAULT 'pending'::text NOT NULL,
  flw_response jsonb,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bill_payments_reference_key UNIQUE (reference),
  CONSTRAINT bill_payments_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_payments TO authenticated;
GRANT ALL ON public.bill_payments TO service_role;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

-- TABLE: business_card_members
CREATE TABLE IF NOT EXISTS public.business_card_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  program_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role business_card_role DEFAULT 'member'::business_card_role NOT NULL,
  department text,
  per_member_monthly_cap numeric(20,2),
  invited_at timestamp with time zone DEFAULT now() NOT NULL,
  joined_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  CONSTRAINT business_card_members_program_id_user_id_key UNIQUE (program_id, user_id),
  CONSTRAINT business_card_members_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_card_members TO authenticated;
GRANT ALL ON public.business_card_members TO service_role;
ALTER TABLE public.business_card_members ENABLE ROW LEVEL SECURITY;

-- TABLE: business_card_programs
CREATE TABLE IF NOT EXISTS public.business_card_programs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  default_currency character varying(10) DEFAULT 'CAD'::character varying NOT NULL,
  funding_wallet_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT business_card_programs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_card_programs TO authenticated;
GRANT ALL ON public.business_card_programs TO service_role;
ALTER TABLE public.business_card_programs ENABLE ROW LEVEL SECURITY;

-- TABLE: card_authorizations
CREATE TABLE IF NOT EXISTS public.card_authorizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  stripe_authorization_id text,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) NOT NULL,
  merchant_name text,
  merchant_category text,
  merchant_country text,
  status card_authorization_status DEFAULT 'pending'::card_authorization_status NOT NULL,
  decline_reason text,
  approved_at timestamp with time zone,
  declined_at timestamp with time zone,
  raw_payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT card_authorizations_stripe_authorization_id_key UNIQUE (stripe_authorization_id),
  CONSTRAINT card_authorizations_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_authorizations TO authenticated;
GRANT ALL ON public.card_authorizations TO service_role;
ALTER TABLE public.card_authorizations ENABLE ROW LEVEL SECURITY;

-- TABLE: card_fraud_signals
CREATE TABLE IF NOT EXISTS public.card_fraud_signals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  authorization_id uuid,
  signal_type text NOT NULL,
  severity card_fraud_severity DEFAULT 'low'::card_fraud_severity NOT NULL,
  score numeric(5,2),
  details jsonb,
  resolved boolean DEFAULT false NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT card_fraud_signals_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_fraud_signals TO authenticated;
GRANT ALL ON public.card_fraud_signals TO service_role;
ALTER TABLE public.card_fraud_signals ENABLE ROW LEVEL SECURITY;

-- TABLE: card_funding_events
CREATE TABLE IF NOT EXISTS public.card_funding_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source card_funding_source DEFAULT 'wallet'::card_funding_source NOT NULL,
  source_wallet_id uuid,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) NOT NULL,
  ledger_journal_id uuid,
  status card_funding_status DEFAULT 'pending'::card_funding_status NOT NULL,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  CONSTRAINT card_funding_events_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_funding_events TO authenticated;
GRANT ALL ON public.card_funding_events TO service_role;
ALTER TABLE public.card_funding_events ENABLE ROW LEVEL SECURITY;

-- TABLE: card_spending_controls
CREATE TABLE IF NOT EXISTS public.card_spending_controls (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  card_id uuid NOT NULL,
  per_authorization_limit numeric(20,2),
  daily_limit numeric(20,2),
  weekly_limit numeric(20,2),
  monthly_limit numeric(20,2),
  allowed_categories text[],
  blocked_categories text[],
  allowed_countries text[],
  blocked_countries text[],
  single_use boolean DEFAULT false NOT NULL,
  subscription_lock_merchant text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT card_spending_controls_card_id_key UNIQUE (card_id),
  CONSTRAINT card_spending_controls_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_spending_controls TO authenticated;
GRANT ALL ON public.card_spending_controls TO service_role;
ALTER TABLE public.card_spending_controls ENABLE ROW LEVEL SECURITY;

-- TABLE: card_transactions
CREATE TABLE IF NOT EXISTS public.card_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  authorization_id uuid,
  stripe_transaction_id text,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) NOT NULL,
  merchant_name text,
  merchant_category text,
  mcc text,
  posted_at timestamp with time zone DEFAULT now() NOT NULL,
  raw_payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT card_transactions_stripe_transaction_id_key UNIQUE (stripe_transaction_id),
  CONSTRAINT card_transactions_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_transactions TO authenticated;
GRANT ALL ON public.card_transactions TO service_role;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;

-- TABLE: cardholders
CREATE TABLE IF NOT EXISTS public.cardholders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  stripe_cardholder_id text,
  type cardholder_type DEFAULT 'individual'::cardholder_type NOT NULL,
  legal_name text NOT NULL,
  email text NOT NULL,
  phone text,
  billing_line1 text NOT NULL,
  billing_line2 text,
  billing_city text NOT NULL,
  billing_state text NOT NULL,
  billing_postal_code text NOT NULL,
  billing_country text DEFAULT 'CA'::text NOT NULL,
  status cardholder_status DEFAULT 'active'::cardholder_status NOT NULL,
  kyc_verified_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT cardholders_stripe_cardholder_id_key UNIQUE (stripe_cardholder_id),
  CONSTRAINT cardholders_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardholders TO authenticated;
GRANT ALL ON public.cardholders TO service_role;
ALTER TABLE public.cardholders ENABLE ROW LEVEL SECURITY;

-- TABLE: cards
CREATE TABLE IF NOT EXISTS public.cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  card_type text DEFAULT 'virtual'::text NOT NULL,
  card_network text DEFAULT 'visa'::text NOT NULL,
  last_four text NOT NULL,
  cardholder_name text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  spending_limit numeric DEFAULT 5000 NOT NULL,
  wallet_id uuid,
  expires_at date DEFAULT (CURRENT_DATE + '4 years'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expiry_month integer,
  expiry_year integer,
  funding_source text DEFAULT 'wallet'::text NOT NULL,
  credit_limit numeric,
  CONSTRAINT cards_pkey PRIMARY KEY (id),
  CONSTRAINT cards_card_network_check CHECK ((card_network = ANY (ARRAY['visa'::text, 'mastercard'::text]))),
  CONSTRAINT cards_card_type_check CHECK ((card_type = ANY (ARRAY['virtual'::text, 'physical'::text, 'debit'::text, 'debit_visa'::text, 'credit'::text]))),
  CONSTRAINT cards_status_check CHECK ((status = ANY (ARRAY['active'::text, 'frozen'::text, 'cancelled'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- TABLE: circle_webhook_events
CREATE TABLE IF NOT EXISTS public.circle_webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  circle_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT circle_webhook_events_circle_event_id_key UNIQUE (circle_event_id),
  CONSTRAINT circle_webhook_events_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circle_webhook_events TO authenticated;
GRANT ALL ON public.circle_webhook_events TO service_role;
ALTER TABLE public.circle_webhook_events ENABLE ROW LEVEL SECURITY;

-- TABLE: compliance_alerts
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  rule_id uuid NOT NULL,
  transfer_id uuid,
  severity alert_severity NOT NULL,
  status alert_status DEFAULT 'open'::alert_status NOT NULL,
  alert_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  notes text,
  assigned_to uuid,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT compliance_alerts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_alerts TO authenticated;
GRANT ALL ON public.compliance_alerts TO service_role;
ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

-- TABLE: compliance_reports
CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_type character varying(50) NOT NULL,
  reporting_period_start date NOT NULL,
  reporting_period_end date NOT NULL,
  jurisdiction character varying(10) NOT NULL,
  status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
  report_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  filed_at timestamp with time zone,
  filed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT compliance_reports_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_reports TO authenticated;
GRANT ALL ON public.compliance_reports TO service_role;
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

-- TABLE: compliance_rules
CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rule_code character varying(50) NOT NULL,
  rule_name character varying(255) NOT NULL,
  description text,
  rule_type character varying(50) NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
  severity alert_severity DEFAULT 'medium'::alert_severity NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT compliance_rules_rule_code_key UNIQUE (rule_code),
  CONSTRAINT compliance_rules_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_rules TO authenticated;
GRANT ALL ON public.compliance_rules TO service_role;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

-- TABLE: cpn_corridors
CREATE TABLE IF NOT EXISTS public.cpn_corridors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_currency character varying(10) NOT NULL,
  dest_country character varying(2) NOT NULL,
  dest_currency character varying(10) NOT NULL,
  payout_method character varying(20) DEFAULT 'bank'::character varying NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  min_amount numeric(20,2) DEFAULT 1 NOT NULL,
  max_amount numeric(20,2) DEFAULT 10000 NOT NULL,
  est_minutes integer DEFAULT 60 NOT NULL,
  markup_bps integer DEFAULT 75 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT cpn_corridors_source_currency_dest_country_dest_currency_pa_key UNIQUE (source_currency, dest_country, dest_currency, payout_method),
  CONSTRAINT cpn_corridors_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpn_corridors TO authenticated;
GRANT ALL ON public.cpn_corridors TO service_role;
ALTER TABLE public.cpn_corridors ENABLE ROW LEVEL SECURITY;

-- TABLE: crm_activities
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  activity_type character varying(50) NOT NULL,
  subject character varying(255) NOT NULL,
  description text,
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  assigned_to uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT crm_activities_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

-- TABLE: crossmint_wallets
CREATE TABLE IF NOT EXISTS public.crossmint_wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  chain text NOT NULL,
  address text NOT NULL,
  locator text NOT NULL,
  env text DEFAULT 'staging'::text NOT NULL,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT crossmint_wallets_user_id_chain_env_key UNIQUE (user_id, chain, env),
  CONSTRAINT crossmint_wallets_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crossmint_wallets TO authenticated;
GRANT ALL ON public.crossmint_wallets TO service_role;
ALTER TABLE public.crossmint_wallets ENABLE ROW LEVEL SECURITY;

-- TABLE: crossmint_yellowcard_transfers
CREATE TABLE IF NOT EXISTS public.crossmint_yellowcard_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source_currency character varying(10) NOT NULL,
  source_amount numeric(20,2) NOT NULL,
  destination_currency character varying(10) NOT NULL,
  destination_amount numeric(20,2),
  destination_country character varying(2) NOT NULL,
  recipient_name text NOT NULL,
  recipient_bank_name text,
  recipient_bank_code text,
  recipient_account_number text NOT NULL,
  recipient_phone text,
  recipient_email text,
  fx_rate numeric(20,8),
  fee_amount numeric(20,2) DEFAULT 0,
  status text DEFAULT 'pending'::text NOT NULL,
  crossmint_order_id text,
  crossmint_checkout_url text,
  crossmint_raw jsonb,
  stellar_tx_hash text,
  yellowcard_payment_id text,
  yellowcard_raw jsonb,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  smart_wallet_address text,
  payout_tx_hash text,
  CONSTRAINT crossmint_yellowcard_transfers_crossmint_order_id_key UNIQUE (crossmint_order_id),
  CONSTRAINT crossmint_yellowcard_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT crossmint_yellowcard_transfers_source_amount_check CHECK ((source_amount > (0)::numeric)),
  CONSTRAINT crossmint_yellowcard_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'card_charged'::text, 'usdc_received'::text, 'payout_sent'::text, 'success'::text, 'failed'::text, 'cancelled'::text, 'pending_payout'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crossmint_yellowcard_transfers TO authenticated;
GRANT ALL ON public.crossmint_yellowcard_transfers TO service_role;
ALTER TABLE public.crossmint_yellowcard_transfers ENABLE ROW LEVEL SECURITY;

-- TABLE: crypto_pairs
CREATE TABLE IF NOT EXISTS public.crypto_pairs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  base_currency character varying(10) NOT NULL,
  quote_currency character varying(10) NOT NULL,
  min_trade_amount numeric(20,8) DEFAULT 1 NOT NULL,
  max_trade_amount numeric(20,8),
  is_active boolean DEFAULT true NOT NULL,
  trading_fee_percent numeric(5,4) DEFAULT 0.0025 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT crypto_pairs_base_currency_quote_currency_key UNIQUE (base_currency, quote_currency),
  CONSTRAINT crypto_pairs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crypto_pairs TO authenticated;
GRANT ALL ON public.crypto_pairs TO service_role;
ALTER TABLE public.crypto_pairs ENABLE ROW LEVEL SECURITY;

-- TABLE: crypto_trades
CREATE TABLE IF NOT EXISTS public.crypto_trades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  pair_id uuid NOT NULL,
  side trade_side NOT NULL,
  base_wallet_id uuid,
  quote_wallet_id uuid,
  base_amount numeric(20,8) NOT NULL,
  quote_amount numeric(20,8) NOT NULL,
  price numeric(20,8) NOT NULL,
  fee_amount numeric(20,8) DEFAULT 0 NOT NULL,
  fee_currency character varying(10),
  status trade_status DEFAULT 'pending'::trade_status NOT NULL,
  journal_id uuid,
  executed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT crypto_trades_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crypto_trades TO authenticated;
GRANT ALL ON public.crypto_trades TO service_role;
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;

-- TABLE: currencies
CREATE TABLE IF NOT EXISTS public.currencies (
  code character varying(10) NOT NULL,
  name character varying(100) NOT NULL,
  symbol character varying(10) NOT NULL,
  currency_type currency_type DEFAULT 'fiat'::currency_type NOT NULL,
  decimal_places integer DEFAULT 2 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  flag_emoji character varying(10),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT currencies_pkey PRIMARY KEY (code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- TABLE: customer_communications
CREATE TABLE IF NOT EXISTS public.customer_communications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  user_id uuid,
  channel character varying(50) NOT NULL,
  direction character varying(10) NOT NULL,
  subject text,
  content text NOT NULL,
  template_id character varying(100),
  status character varying(50) DEFAULT 'sent'::character varying NOT NULL,
  sent_at timestamp with time zone,
  read_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_communications_pkey PRIMARY KEY (id),
  CONSTRAINT customer_communications_channel_check CHECK (((channel)::text = ANY ((ARRAY['email'::character varying, 'sms'::character varying, 'in_app'::character varying, 'whatsapp'::character varying, 'push'::character varying, 'phone_call'::character varying])::text[]))),
  CONSTRAINT customer_communications_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[]))),
  CONSTRAINT customer_communications_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'read'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_communications TO authenticated;
GRANT ALL ON public.customer_communications TO service_role;
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;

-- TABLE: customer_documents
CREATE TABLE IF NOT EXISTS public.customer_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  onboarding_id uuid,
  document_type character varying(100) NOT NULL,
  file_name character varying(255) NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  mime_type character varying(100),
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_documents_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

-- TABLE: customer_onboarding
CREATE TABLE IF NOT EXISTS public.customer_onboarding (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  step_id uuid NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  completed_at timestamp with time zone,
  notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_onboarding_customer_id_step_id_key UNIQUE (customer_id, step_id),
  CONSTRAINT customer_onboarding_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_onboarding TO authenticated;
GRANT ALL ON public.customer_onboarding TO service_role;
ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;

-- TABLE: customer_portal_access
CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  user_id uuid,
  access_token character varying(255),
  token_expires_at timestamp with time zone,
  last_login_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_portal_access_customer_id_key UNIQUE (customer_id),
  CONSTRAINT customer_portal_access_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO authenticated;
GRANT ALL ON public.customer_portal_access TO service_role;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;

-- TABLE: customers
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(255) NOT NULL,
  email character varying(255),
  phone character varying(50),
  address text,
  tax_id character varying(100),
  payment_terms integer DEFAULT 30,
  credit_limit numeric(20,2) DEFAULT 0,
  currency_code character varying(10) DEFAULT 'USD'::character varying,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kyc_status character varying(50) DEFAULT 'pending'::character varying,
  kyc_verified_at timestamp with time zone,
  kyc_verified_by uuid,
  onboarding_started_at timestamp with time zone,
  onboarding_completed_at timestamp with time zone,
  company_type character varying(100),
  registration_number character varying(100),
  date_of_incorporation date,
  industry character varying(100),
  website character varying(255),
  risk_level character varying(50) DEFAULT 'medium'::character varying,
  onboarded_by_admin_id uuid,
  onboarded_via text CHECK (onboarded_via IN ('self','admin','developer_api')),
  onboarded_at timestamp with time zone,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- TABLE: disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transaction_id uuid,
  customer_id uuid,
  user_id uuid,
  dispute_type character varying(50) NOT NULL,
  status character varying(50) DEFAULT 'open'::character varying NOT NULL,
  priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
  amount numeric(20,8),
  currency_code character varying(10),
  reason text NOT NULL,
  customer_statement text,
  evidence_urls text[],
  resolution text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  assigned_to uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT disputes_pkey PRIMARY KEY (id),
  CONSTRAINT disputes_dispute_type_check CHECK (((dispute_type)::text = ANY ((ARRAY['chargeback'::character varying, 'refund_request'::character varying, 'transaction_error'::character varying, 'unauthorized'::character varying, 'service_issue'::character varying, 'other'::character varying])::text[]))),
  CONSTRAINT disputes_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
  CONSTRAINT disputes_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'investigating'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'rejected'::character varying, 'resolved'::character varying, 'escalated'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- TABLE: flw_banks_cache
CREATE TABLE IF NOT EXISTS public.flw_banks_cache (
  country text NOT NULL,
  banks jsonb NOT NULL,
  fetched_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flw_banks_cache_pkey PRIMARY KEY (country)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flw_banks_cache TO authenticated;
GRANT ALL ON public.flw_banks_cache TO service_role;
ALTER TABLE public.flw_banks_cache ENABLE ROW LEVEL SECURITY;

-- TABLE: flw_billers_cache
CREATE TABLE IF NOT EXISTS public.flw_billers_cache (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country text NOT NULL,
  category text,
  billers jsonb NOT NULL,
  fetched_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flw_billers_cache_country_category_key UNIQUE (country, category),
  CONSTRAINT flw_billers_cache_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flw_billers_cache TO authenticated;
GRANT ALL ON public.flw_billers_cache TO service_role;
ALTER TABLE public.flw_billers_cache ENABLE ROW LEVEL SECURITY;

-- TABLE: flw_webhook_logs
CREATE TABLE IF NOT EXISTS public.flw_webhook_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event text,
  payload jsonb,
  processed boolean DEFAULT false NOT NULL,
  error text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flw_webhook_logs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flw_webhook_logs TO authenticated;
GRANT ALL ON public.flw_webhook_logs TO service_role;
ALTER TABLE public.flw_webhook_logs ENABLE ROW LEVEL SECURITY;

-- TABLE: fx_rates
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_currency character varying(10) NOT NULL,
  to_currency character varying(10) NOT NULL,
  rate numeric(20,8) NOT NULL,
  markup_rate numeric(20,8) DEFAULT 0 NOT NULL,
  effective_rate numeric(20,8) NOT NULL,
  source character varying(50) DEFAULT 'manual'::character varying,
  valid_from timestamp with time zone DEFAULT now() NOT NULL,
  valid_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fx_rates_from_currency_to_currency_valid_from_key UNIQUE (from_currency, to_currency, valid_from),
  CONSTRAINT fx_rates_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- TABLE: fx_transactions
CREATE TABLE IF NOT EXISTS public.fx_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  from_wallet_id uuid NOT NULL,
  to_wallet_id uuid NOT NULL,
  from_currency character varying(10) NOT NULL,
  to_currency character varying(10) NOT NULL,
  from_amount numeric(20,8) NOT NULL,
  to_amount numeric(20,8) NOT NULL,
  market_rate numeric(20,8) NOT NULL,
  markup_rate numeric(20,8) DEFAULT 0 NOT NULL,
  effective_rate numeric(20,8) NOT NULL,
  fee_amount numeric(20,8) DEFAULT 0 NOT NULL,
  rate_locked_at timestamp with time zone DEFAULT now() NOT NULL,
  rate_expires_at timestamp with time zone NOT NULL,
  status trade_status DEFAULT 'pending'::trade_status NOT NULL,
  journal_id uuid,
  executed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fx_transactions_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_transactions TO authenticated;
GRANT ALL ON public.fx_transactions TO service_role;
ALTER TABLE public.fx_transactions ENABLE ROW LEVEL SECURITY;

-- TABLE: input_tax_credits
CREATE TABLE IF NOT EXISTS public.input_tax_credits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  vendor_id uuid,
  invoice_reference text,
  expense_description text NOT NULL,
  expense_amount numeric(18,2) NOT NULL,
  tax_type tax_type NOT NULL,
  tax_amount numeric(18,2) NOT NULL,
  is_claimed boolean DEFAULT false NOT NULL,
  claimed_in_filing_id uuid,
  expense_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT input_tax_credits_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.input_tax_credits TO authenticated;
GRANT ALL ON public.input_tax_credits TO service_role;
ALTER TABLE public.input_tax_credits ENABLE ROW LEVEL SECURITY;

-- TABLE: integration_settings
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT integration_settings_key_key UNIQUE (key),
  CONSTRAINT integration_settings_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_settings TO authenticated;
GRANT ALL ON public.integration_settings TO service_role;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- TABLE: interac_sessions
CREATE TABLE IF NOT EXISTS public.interac_sessions (
  state text NOT NULL,
  user_id uuid NOT NULL,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT interac_sessions_pkey PRIMARY KEY (state)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interac_sessions TO authenticated;
GRANT ALL ON public.interac_sessions TO service_role;
ALTER TABLE public.interac_sessions ENABLE ROW LEVEL SECURITY;

-- TABLE: intra_ca_transfers
CREATE TABLE IF NOT EXISTS public.intra_ca_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  reference text DEFAULT ('EFM-CA-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) NOT NULL,
  plaid_account_id uuid,
  destination_wallet_id uuid,
  amount_cad numeric(20,2) NOT NULL,
  description text,
  status text DEFAULT 'initiated'::text NOT NULL,
  stripe_payment_intent_id text,
  stripe_status text,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT intra_ca_transfers_reference_key UNIQUE (reference),
  CONSTRAINT intra_ca_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT intra_ca_transfers_amount_cad_check CHECK ((amount_cad > (0)::numeric))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intra_ca_transfers TO authenticated;
GRANT ALL ON public.intra_ca_transfers TO service_role;
ALTER TABLE public.intra_ca_transfers ENABLE ROW LEVEL SECURITY;

-- TABLE: issued_cards
CREATE TABLE IF NOT EXISTS public.issued_cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  cardholder_id uuid NOT NULL,
  stripe_card_id text,
  last4 text,
  brand text DEFAULT 'visa'::text NOT NULL,
  currency character varying(10) DEFAULT 'CAD'::character varying NOT NULL,
  card_type issued_card_type DEFAULT 'virtual'::issued_card_type NOT NULL,
  purpose issued_card_purpose DEFAULT 'personal'::issued_card_purpose NOT NULL,
  status issued_card_status DEFAULT 'pending'::issued_card_status NOT NULL,
  nickname text,
  funding_wallet_id uuid,
  exp_month integer,
  exp_year integer,
  cancelled_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT issued_cards_stripe_card_id_key UNIQUE (stripe_card_id),
  CONSTRAINT issued_cards_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_cards TO authenticated;
GRANT ALL ON public.issued_cards TO service_role;
ALTER TABLE public.issued_cards ENABLE ROW LEVEL SECURITY;

-- TABLE: kyc_audit_log
CREATE TABLE IF NOT EXISTS public.kyc_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kyc_verification_id uuid NOT NULL,
  admin_id uuid,
  action text NOT NULL,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT kyc_audit_log_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_audit_log TO authenticated;
GRANT ALL ON public.kyc_audit_log TO service_role;
ALTER TABLE public.kyc_audit_log ENABLE ROW LEVEL SECURITY;

-- TABLE: kyc_verifications
CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  verification_status kyc_verification_status DEFAULT 'not_started'::kyc_verification_status NOT NULL,
  current_step kyc_current_step DEFAULT 'identity'::kyc_current_step NOT NULL,
  id_document_type kyc_id_doc_type,
  id_document_url text,
  id_document_country text,
  id_verification_status kyc_doc_review_status DEFAULT 'pending'::kyc_doc_review_status NOT NULL,
  id_rejection_reason text,
  address_document_type kyc_address_doc_type,
  address_document_url text,
  address_verification_status kyc_doc_review_status DEFAULT 'pending'::kyc_doc_review_status NOT NULL,
  address_rejection_reason text,
  selfie_url text,
  liveness_check_status kyc_doc_review_status DEFAULT 'pending'::kyc_doc_review_status NOT NULL,
  persona_inquiry_id text,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  internal_notes text,
  escalated boolean DEFAULT false NOT NULL,
  escalated_at timestamp with time zone,
  persona_inquiry_status text,
  persona_verification_data jsonb,
  persona_session_token text,
  persona_decision text,
  persona_decision_reason text,
  interac_session_id text,
  interac_sub text,
  interac_verification_status text,
  interac_claims jsonb,
  interac_completed_at timestamp with time zone,
  verification_provider text,
  source_of_funds_url text,
  source_of_funds_type text,
  source_of_funds_status text DEFAULT 'pending'::text NOT NULL,
  address_proof_url text,
  tier_target user_risk_tier,
  CONSTRAINT kyc_verifications_user_id_key UNIQUE (user_id),
  CONSTRAINT kyc_verifications_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_verifications TO authenticated;
GRANT ALL ON public.kyc_verifications TO service_role;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

-- TABLE: ledger_accounts
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code character varying(20) NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  account_type account_type NOT NULL,
  currency_code character varying(10),
  parent_id uuid,
  is_system boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ledger_accounts_code_key UNIQUE (code),
  CONSTRAINT ledger_accounts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_accounts TO authenticated;
GRANT ALL ON public.ledger_accounts TO service_role;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: ledger_entries
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  journal_id uuid NOT NULL,
  account_id uuid NOT NULL,
  wallet_id uuid,
  currency_code character varying(10) NOT NULL,
  debit_amount numeric(20,8) DEFAULT 0 NOT NULL,
  credit_amount numeric(20,8) DEFAULT 0 NOT NULL,
  description text,
  reference_type character varying(50),
  reference_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  external_reference text,
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT valid_entry CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((credit_amount > (0)::numeric) AND (debit_amount = (0)::numeric))))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- TABLE: linked_funding_sources
CREATE TABLE IF NOT EXISTS public.linked_funding_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source_type text NOT NULL,
  display_name text NOT NULL,
  institution text,
  last_four text NOT NULL,
  currency_code character varying(10) DEFAULT 'CAD'::character varying NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT linked_funding_sources_pkey PRIMARY KEY (id),
  CONSTRAINT linked_funding_sources_source_type_check CHECK ((source_type = ANY (ARRAY['bank'::text, 'card'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linked_funding_sources TO authenticated;
GRANT ALL ON public.linked_funding_sources TO service_role;
ALTER TABLE public.linked_funding_sources ENABLE ROW LEVEL SECURITY;

-- TABLE: maker_checker_requests
CREATE TABLE IF NOT EXISTS public.maker_checker_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_type character varying(100) NOT NULL,
  entity_type character varying(100) NOT NULL,
  entity_id uuid,
  action character varying(50) NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  request_data jsonb NOT NULL,
  reason text,
  maker_id uuid NOT NULL,
  checker_id uuid,
  checker_notes text,
  expires_at timestamp with time zone,
  checked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT maker_checker_requests_pkey PRIMARY KEY (id),
  CONSTRAINT maker_checker_requests_action_check CHECK (((action)::text = ANY ((ARRAY['create'::character varying, 'update'::character varying, 'delete'::character varying, 'freeze'::character varying, 'unfreeze'::character varying, 'approve'::character varying, 'reject'::character varying, 'reverse'::character varying, 'override'::character varying])::text[]))),
  CONSTRAINT maker_checker_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maker_checker_requests TO authenticated;
GRANT ALL ON public.maker_checker_requests TO service_role;
ALTER TABLE public.maker_checker_requests ENABLE ROW LEVEL SECURITY;

-- TABLE: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info'::text NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- TABLE: onboarding_steps
CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  step_order integer NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  is_required boolean DEFAULT true NOT NULL,
  requires_document boolean DEFAULT false NOT NULL,
  document_type character varying(100),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT onboarding_steps_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_steps TO authenticated;
GRANT ALL ON public.onboarding_steps TO service_role;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- TABLE: operations_kpis
CREATE TABLE IF NOT EXISTS public.operations_kpis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  metric_name character varying(100) NOT NULL,
  metric_value numeric(20,4) NOT NULL,
  metric_unit character varying(50),
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  dimensions jsonb DEFAULT '{}'::jsonb,
  calculated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT operations_kpis_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_kpis TO authenticated;
GRANT ALL ON public.operations_kpis TO service_role;
ALTER TABLE public.operations_kpis ENABLE ROW LEVEL SECURITY;

-- TABLE: paysafe_webhook_logs
CREATE TABLE IF NOT EXISTS public.paysafe_webhook_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text,
  event_id text,
  account_id text,
  merchant_ref_num text,
  payment_handle_token text,
  payment_id text,
  status text,
  amount numeric,
  currency_code text,
  raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  processing_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT paysafe_webhook_logs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paysafe_webhook_logs TO authenticated;
GRANT ALL ON public.paysafe_webhook_logs TO service_role;
ALTER TABLE public.paysafe_webhook_logs ENABLE ROW LEVEL SECURITY;

-- TABLE: persona_webhook_logs
CREATE TABLE IF NOT EXISTS public.persona_webhook_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text,
  inquiry_id text,
  payload jsonb,
  processed boolean DEFAULT false NOT NULL,
  error text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT persona_webhook_logs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_webhook_logs TO authenticated;
GRANT ALL ON public.persona_webhook_logs TO service_role;
ALTER TABLE public.persona_webhook_logs ENABLE ROW LEVEL SECURITY;

-- TABLE: plaid_accounts
CREATE TABLE IF NOT EXISTS public.plaid_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  plaid_account_id text NOT NULL,
  name text NOT NULL,
  official_name text,
  mask text,
  subtype text,
  type text,
  institution_number text,
  branch_number text,
  account_number text,
  currency_code text DEFAULT 'CAD'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT plaid_accounts_item_id_plaid_account_id_key UNIQUE (item_id, plaid_account_id),
  CONSTRAINT plaid_accounts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plaid_accounts TO authenticated;
GRANT ALL ON public.plaid_accounts TO service_role;
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: plaid_items
CREATE TABLE IF NOT EXISTS public.plaid_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_id text,
  institution_name text,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT plaid_items_item_id_key UNIQUE (item_id),
  CONSTRAINT plaid_items_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plaid_items TO authenticated;
GRANT ALL ON public.plaid_items TO service_role;
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;

-- TABLE: pricing_config
CREATE TABLE IF NOT EXISTS public.pricing_config (
  key text NOT NULL,
  value numeric NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT pricing_config_pkey PRIMARY KEY (key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_config TO authenticated;
GRANT ALL ON public.pricing_config TO service_role;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- TABLE: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email character varying(255),
  full_name character varying(255),
  phone_number character varying(50),
  country_code character varying(3),
  kyc_status kyc_status DEFAULT 'pending'::kyc_status NOT NULL,
  kyc_tier kyc_tier DEFAULT 'tier_0'::kyc_tier NOT NULL,
  risk_score integer DEFAULT 0,
  default_currency character varying(10) DEFAULT 'USD'::character varying,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_number text,
  account_status account_status_enum DEFAULT 'pending_verification'::account_status_enum NOT NULL,
  kyc_completed_at timestamp with time zone,
  street_address text,
  city text,
  state_province text,
  postal_code text,
  address_country text,
  stripe_customer_id text,
  stellar_seed_encrypted text,
  stellar_public_key text,
  efin_tag text,
  kyc_framework_version smallint DEFAULT 2 NOT NULL,
  aml_status aml_profile_status DEFAULT 'unscreened'::aml_profile_status NOT NULL,
  aml_last_screened_at timestamp with time zone,
  onboarded_by_admin_id uuid,
  onboarded_via text CHECK (onboarded_via IN ('self','admin','developer_api')),
  onboarded_at timestamp with time zone,
  CONSTRAINT profiles_account_number_key UNIQUE (account_number),
  CONSTRAINT profiles_stripe_customer_id_key UNIQUE (stripe_customer_id),
  CONSTRAINT profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_efin_tag_format_chk CHECK (((efin_tag IS NULL) OR (efin_tag ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'::text)))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- TABLE: purchase_bill_items
CREATE TABLE IF NOT EXISTS public.purchase_bill_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1 NOT NULL,
  unit_price numeric(20,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0,
  amount numeric(20,2) NOT NULL,
  account_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_bill_items_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bill_items TO authenticated;
GRANT ALL ON public.purchase_bill_items TO service_role;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;

-- TABLE: purchase_bills
CREATE TABLE IF NOT EXISTS public.purchase_bills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_number character varying(50) NOT NULL,
  vendor_reference character varying(100),
  vendor_id uuid NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date NOT NULL,
  status invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
  subtotal numeric(20,2) DEFAULT 0 NOT NULL,
  tax_amount numeric(20,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(20,2) DEFAULT 0 NOT NULL,
  total_amount numeric(20,2) DEFAULT 0 NOT NULL,
  amount_paid numeric(20,2) DEFAULT 0 NOT NULL,
  currency_code character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  notes text,
  journal_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_bills_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bills TO authenticated;
GRANT ALL ON public.purchase_bills TO service_role;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;

-- TABLE: rate_limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key character varying(255) NOT NULL,
  count integer DEFAULT 1 NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- TABLE: reconciliation_records
CREATE TABLE IF NOT EXISTS public.reconciliation_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bank_transaction_id uuid,
  ledger_entry_id uuid,
  transfer_id uuid,
  matched_amount numeric(20,8),
  status reconciliation_status DEFAULT 'pending'::reconciliation_status NOT NULL,
  match_confidence numeric(5,2),
  match_reason text,
  exception_reason text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT reconciliation_records_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_records TO authenticated;
GRANT ALL ON public.reconciliation_records TO service_role;
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;

-- TABLE: regulatory_reports
CREATE TABLE IF NOT EXISTS public.regulatory_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_type character varying(50) NOT NULL,
  jurisdiction character varying(10) NOT NULL,
  status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
  reference_number character varying(100),
  subject_user_id uuid,
  subject_customer_id uuid,
  related_transfers uuid[],
  report_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  narrative text,
  filing_deadline timestamp with time zone,
  submitted_at timestamp with time zone,
  submitted_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  regulator_acknowledgment text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT regulatory_reports_pkey PRIMARY KEY (id),
  CONSTRAINT regulatory_reports_report_type_check CHECK (((report_type)::text = ANY ((ARRAY['SAR'::character varying, 'STR'::character varying, 'CTR'::character varying, 'FBAR'::character varying, 'large_transaction'::character varying, 'cross_border'::character varying])::text[]))),
  CONSTRAINT regulatory_reports_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'pending_review'::character varying, 'approved'::character varying, 'submitted'::character varying, 'acknowledged'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regulatory_reports TO authenticated;
GRANT ALL ON public.regulatory_reports TO service_role;
ALTER TABLE public.regulatory_reports ENABLE ROW LEVEL SECURITY;

-- TABLE: sales_invoice_items
CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1 NOT NULL,
  unit_price numeric(20,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0,
  amount numeric(20,2) NOT NULL,
  account_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT sales_invoice_items_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;

-- TABLE: sales_invoices
CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_number character varying(50) NOT NULL,
  customer_id uuid NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date NOT NULL,
  status invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
  subtotal numeric(20,2) DEFAULT 0 NOT NULL,
  tax_amount numeric(20,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(20,2) DEFAULT 0 NOT NULL,
  total_amount numeric(20,2) DEFAULT 0 NOT NULL,
  amount_paid numeric(20,2) DEFAULT 0 NOT NULL,
  currency_code character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  notes text,
  journal_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT sales_invoices_invoice_number_key UNIQUE (invoice_number),
  CONSTRAINT sales_invoices_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;

-- TABLE: saved_payment_methods
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  card_brand text,
  last_four text,
  exp_month integer,
  exp_year integer,
  cardholder_name text,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  currency_code text,
  country_code text,
  CONSTRAINT saved_payment_methods_stripe_payment_method_id_key UNIQUE (stripe_payment_method_id),
  CONSTRAINT saved_payment_methods_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_payment_methods TO authenticated;
GRANT ALL ON public.saved_payment_methods TO service_role;
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

-- TABLE: savings_goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_amount numeric NOT NULL,
  current_amount numeric DEFAULT 0 NOT NULL,
  currency_code character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  source_wallet_id uuid,
  target_date date,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT savings_goals_pkey PRIMARY KEY (id),
  CONSTRAINT savings_goals_current_amount_check CHECK ((current_amount >= (0)::numeric)),
  CONSTRAINT savings_goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT savings_goals_target_amount_check CHECK ((target_amount > (0)::numeric))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

-- TABLE: short_links
CREATE TABLE IF NOT EXISTS public.short_links (
  code text NOT NULL,
  owner_id uuid,
  target_path text NOT NULL,
  params jsonb DEFAULT '{}'::jsonb NOT NULL,
  expires_at timestamp with time zone,
  max_uses integer,
  use_count integer DEFAULT 0 NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT short_links_pkey PRIMARY KEY (code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- TABLE: stripe_connected_accounts
CREATE TABLE IF NOT EXISTS public.stripe_connected_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  stripe_account_id text NOT NULL,
  country text NOT NULL,
  display_name text,
  contact_email text,
  dashboard text DEFAULT 'full'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
  requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT stripe_connected_accounts_stripe_account_id_key UNIQUE (stripe_account_id),
  CONSTRAINT stripe_connected_accounts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_connected_accounts TO authenticated;
GRANT ALL ON public.stripe_connected_accounts TO service_role;
ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: stripe_payin_sessions
CREATE TABLE IF NOT EXISTS public.stripe_payin_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount_minor bigint NOT NULL,
  currency_code character varying(10) NOT NULL,
  platform_fee_minor bigint DEFAULT 0 NOT NULL,
  credit_amount numeric(20,8) NOT NULL,
  credit_currency character varying(10) NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  failure_reason text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT stripe_payin_sessions_stripe_session_id_key UNIQUE (stripe_session_id),
  CONSTRAINT stripe_payin_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT stripe_payin_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text, 'expired'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_payin_sessions TO authenticated;
GRANT ALL ON public.stripe_payin_sessions TO service_role;
ALTER TABLE public.stripe_payin_sessions ENABLE ROW LEVEL SECURITY;

-- TABLE: stripe_payout_recipients
CREATE TABLE IF NOT EXISTS public.stripe_payout_recipients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text,
  last4 text,
  brand text,
  stripe_account_id text NOT NULL,
  stripe_external_account_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT stripe_payout_recipients_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_payout_recipients TO authenticated;
GRANT ALL ON public.stripe_payout_recipients TO service_role;
ALTER TABLE public.stripe_payout_recipients ENABLE ROW LEVEL SECURITY;

-- TABLE: sumsub_verifications
CREATE TABLE IF NOT EXISTS public.sumsub_verifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  applicant_id text NOT NULL,
  level_name text NOT NULL,
  review_status text,
  review_answer text,
  review_reject_type text,
  moderation_comment text,
  client_comment text,
  risk_labels jsonb DEFAULT '[]'::jsonb,
  raw_payload jsonb,
  requested_by_admin_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT sumsub_verifications_applicant_id_key UNIQUE (applicant_id),
  CONSTRAINT sumsub_verifications_user_id_level_name_key UNIQUE (user_id, level_name),
  CONSTRAINT sumsub_verifications_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sumsub_verifications TO authenticated;
GRANT ALL ON public.sumsub_verifications TO service_role;
ALTER TABLE public.sumsub_verifications ENABLE ROW LEVEL SECURITY;

-- TABLE: sumsub_webhook_logs
CREATE TABLE IF NOT EXISTS public.sumsub_webhook_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  applicant_id text,
  event_type text,
  payload jsonb NOT NULL,
  signature_valid boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT sumsub_webhook_logs_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sumsub_webhook_logs TO authenticated;
GRANT ALL ON public.sumsub_webhook_logs TO service_role;
ALTER TABLE public.sumsub_webhook_logs ENABLE ROW LEVEL SECURITY;

-- TABLE: tax_filings
CREATE TABLE IF NOT EXISTS public.tax_filings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tax_type tax_type NOT NULL,
  filing_period_start date NOT NULL,
  filing_period_end date NOT NULL,
  tax_collected numeric(18,2) DEFAULT 0 NOT NULL,
  input_tax_credits numeric(18,2) DEFAULT 0 NOT NULL,
  adjustments numeric(18,2) DEFAULT 0 NOT NULL,
  net_tax_payable numeric(18,2) DEFAULT 0 NOT NULL,
  status tax_filing_status DEFAULT 'draft'::tax_filing_status NOT NULL,
  prepared_by uuid,
  prepared_at timestamp with time zone,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone,
  filed_at timestamp with time zone,
  filing_reference text,
  payment_reference text,
  payment_date date,
  cra_confirmation text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tax_filings_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_filings TO authenticated;
GRANT ALL ON public.tax_filings TO service_role;
ALTER TABLE public.tax_filings ENABLE ROW LEVEL SECURITY;

-- TABLE: tax_rates
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  province_code text NOT NULL,
  province_name text NOT NULL,
  tax_type tax_type NOT NULL,
  rate numeric(5,4) NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  effective_to date,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tax_rates_province_code_tax_type_effective_from_key UNIQUE (province_code, tax_type, effective_from),
  CONSTRAINT tax_rates_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

-- TABLE: tax_registrations
CREATE TABLE IF NOT EXISTS public.tax_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tax_type tax_type NOT NULL,
  registration_number text NOT NULL,
  legal_name text NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  effective_to date,
  filing_frequency tax_filing_frequency DEFAULT 'quarterly'::tax_filing_frequency NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tax_registrations_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_registrations TO authenticated;
GRANT ALL ON public.tax_registrations TO service_role;
ALTER TABLE public.tax_registrations ENABLE ROW LEVEL SECURITY;

-- TABLE: tax_transactions
CREATE TABLE IF NOT EXISTS public.tax_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transaction_id text NOT NULL,
  transaction_type text NOT NULL,
  customer_id uuid,
  user_id uuid,
  province_code text NOT NULL,
  taxable_amount numeric(18,2) NOT NULL,
  gst_rate numeric(5,4) DEFAULT 0,
  gst_amount numeric(18,2) DEFAULT 0,
  hst_rate numeric(5,4) DEFAULT 0,
  hst_amount numeric(18,2) DEFAULT 0,
  pst_rate numeric(5,4) DEFAULT 0,
  pst_amount numeric(18,2) DEFAULT 0,
  qst_rate numeric(5,4) DEFAULT 0,
  qst_amount numeric(18,2) DEFAULT 0,
  total_tax numeric(18,2) DEFAULT 0 NOT NULL,
  total_with_tax numeric(18,2) NOT NULL,
  is_refunded boolean DEFAULT false NOT NULL,
  refunded_at timestamp with time zone,
  journal_id uuid,
  invoice_number text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tax_transactions_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_transactions TO authenticated;
GRANT ALL ON public.tax_transactions TO service_role;
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;

-- TABLE: taxable_services
CREATE TABLE IF NOT EXISTS public.taxable_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  service_code text NOT NULL,
  service_name text NOT NULL,
  description text,
  is_taxable boolean DEFAULT true NOT NULL,
  exemption_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT taxable_services_service_code_key UNIQUE (service_code),
  CONSTRAINT taxable_services_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxable_services TO authenticated;
GRANT ALL ON public.taxable_services TO service_role;
ALTER TABLE public.taxable_services ENABLE ROW LEVEL SECURITY;

-- TABLE: tier_limits
CREATE TABLE IF NOT EXISTS public.tier_limits (
  tier user_risk_tier NOT NULL,
  label text NOT NULL,
  max_balance numeric NOT NULL,
  daily_limit numeric NOT NULL,
  monthly_limit numeric NOT NULL,
  single_limit numeric NOT NULL,
  features_enabled jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tier_limits_pkey PRIMARY KEY (tier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tier_limits TO authenticated;
GRANT ALL ON public.tier_limits TO service_role;
ALTER TABLE public.tier_limits ENABLE ROW LEVEL SECURITY;

-- TABLE: transaction_interventions
CREATE TABLE IF NOT EXISTS public.transaction_interventions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_id uuid NOT NULL,
  intervention_type character varying(50) NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  reason text NOT NULL,
  initiated_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamp with time zone,
  executed_at timestamp with time zone,
  result text,
  old_provider character varying(100),
  new_provider character varying(100),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT transaction_interventions_pkey PRIMARY KEY (id),
  CONSTRAINT transaction_interventions_intervention_type_check CHECK (((intervention_type)::text = ANY ((ARRAY['retry'::character varying, 'cancel'::character varying, 'switch_provider'::character varying, 'manual_complete'::character varying, 'reverse'::character varying, 'escalate'::character varying])::text[]))),
  CONSTRAINT transaction_interventions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'executed'::character varying, 'failed'::character varying, 'rejected'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_interventions TO authenticated;
GRANT ALL ON public.transaction_interventions TO service_role;
ALTER TABLE public.transaction_interventions ENABLE ROW LEVEL SECURITY;

-- TABLE: transaction_rules
CREATE TABLE IF NOT EXISTS public.transaction_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  priority integer DEFAULT 100 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  match_type text DEFAULT 'contains'::text NOT NULL,
  match_field text DEFAULT 'description'::text NOT NULL,
  match_value text NOT NULL,
  category text,
  debit_account_id uuid,
  credit_account_id uuid,
  auto_post boolean DEFAULT false NOT NULL,
  ai_generated boolean DEFAULT false NOT NULL,
  ai_confidence numeric(5,4),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT transaction_rules_pkey PRIMARY KEY (id),
  CONSTRAINT transaction_rules_match_field_chk CHECK ((match_field = ANY (ARRAY['description'::text, 'reference'::text]))),
  CONSTRAINT transaction_rules_match_type_chk CHECK ((match_type = ANY (ARRAY['contains'::text, 'starts_with'::text, 'ends_with'::text, 'regex'::text, 'exact'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_rules TO authenticated;
GRANT ALL ON public.transaction_rules TO service_role;
ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;

-- TABLE: transfers
CREATE TABLE IF NOT EXISTS public.transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid,
  sender_wallet_id uuid NOT NULL,
  recipient_name character varying(255) NOT NULL,
  recipient_phone character varying(50),
  recipient_account character varying(100),
  recipient_country character varying(3) NOT NULL,
  transfer_type transfer_type NOT NULL,
  payout_method character varying(50),
  source_currency character varying(10) NOT NULL,
  target_currency character varying(10) NOT NULL,
  source_amount numeric(20,8) NOT NULL,
  target_amount numeric(20,8) NOT NULL,
  exchange_rate numeric(20,8) DEFAULT 1 NOT NULL,
  fee_amount numeric(20,8) DEFAULT 0 NOT NULL,
  status transfer_status DEFAULT 'initiated'::transfer_status NOT NULL,
  provider_reference character varying(255),
  failure_reason text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  recipient_bank_code character varying(20),
  recipient_bank_name character varying(120),
  interac_security_question text,
  interac_security_answer text,
  paysafe_payment_id text,
  funding_source text DEFAULT 'wallet'::text NOT NULL,
  stripe_payout_id text,
  provider_charge_id text,
  stellar_tx_hash text,
  circle_transfer_id text,
  circle_quote_id text,
  circle_status text,
  circle_idempotency_key uuid,
  circle_payload jsonb,
  CONSTRAINT transfers_pkey PRIMARY KEY (id),
  CONSTRAINT transfers_funding_source_check CHECK ((funding_source = ANY (ARRAY['wallet'::text, 'card'::text, 'bank'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- TABLE: treasury_financial_accounts
CREATE TABLE IF NOT EXISTS public.treasury_financial_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stripe_fa_id text NOT NULL,
  owner_kind text NOT NULL,
  user_id uuid,
  connected_account_id text,
  currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  aba_routing text,
  account_number_last4 text,
  status text DEFAULT 'open'::text NOT NULL,
  features jsonb DEFAULT '{}'::jsonb NOT NULL,
  balance_available numeric(20,2) DEFAULT 0 NOT NULL,
  balance_pending numeric(20,2) DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT treasury_financial_accounts_stripe_fa_id_key UNIQUE (stripe_fa_id),
  CONSTRAINT treasury_financial_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT treasury_financial_accounts_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['platform'::text, 'user'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_financial_accounts TO authenticated;
GRANT ALL ON public.treasury_financial_accounts TO service_role;
ALTER TABLE public.treasury_financial_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: treasury_received_entries
CREATE TABLE IF NOT EXISTS public.treasury_received_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fa_id uuid NOT NULL,
  user_id uuid,
  stripe_id text NOT NULL,
  kind text NOT NULL,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  status text DEFAULT 'succeeded'::text NOT NULL,
  network text,
  counterparty jsonb DEFAULT '{}'::jsonb NOT NULL,
  description text,
  journal_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT treasury_received_entries_stripe_id_key UNIQUE (stripe_id),
  CONSTRAINT treasury_received_entries_pkey PRIMARY KEY (id),
  CONSTRAINT treasury_received_entries_kind_check CHECK ((kind = ANY (ARRAY['received_credit'::text, 'received_debit'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_received_entries TO authenticated;
GRANT ALL ON public.treasury_received_entries TO service_role;
ALTER TABLE public.treasury_received_entries ENABLE ROW LEVEL SECURITY;

-- TABLE: treasury_transfers
CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fa_id uuid NOT NULL,
  user_id uuid,
  kind text NOT NULL,
  stripe_id text NOT NULL,
  direction text NOT NULL,
  amount numeric(20,2) NOT NULL,
  currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
  network text,
  status text DEFAULT 'processing'::text NOT NULL,
  counterparty jsonb DEFAULT '{}'::jsonb NOT NULL,
  failure_reason text,
  description text,
  journal_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT treasury_transfers_stripe_id_key UNIQUE (stripe_id),
  CONSTRAINT treasury_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT treasury_transfers_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text]))),
  CONSTRAINT treasury_transfers_kind_check CHECK ((kind = ANY (ARRAY['inbound_transfer'::text, 'outbound_transfer'::text, 'outbound_payment'::text, 'issuing_funding'::text]))),
  CONSTRAINT treasury_transfers_network_check CHECK ((network = ANY (ARRAY['ach'::text, 'us_domestic_wire'::text, 'stripe'::text, 'internal'::text])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_transfers TO authenticated;
GRANT ALL ON public.treasury_transfers TO service_role;
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;

-- TABLE: treasury_webhook_events
CREATE TABLE IF NOT EXISTS public.treasury_webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT treasury_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id),
  CONSTRAINT treasury_webhook_events_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_webhook_events TO authenticated;
GRANT ALL ON public.treasury_webhook_events TO service_role;
ALTER TABLE public.treasury_webhook_events ENABLE ROW LEVEL SECURITY;

-- TABLE: user_risk_tiers
CREATE TABLE IF NOT EXISTS public.user_risk_tiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  current_tier user_risk_tier DEFAULT 'tier_1'::user_risk_tier NOT NULL,
  daily_transaction_limit numeric DEFAULT 500 NOT NULL,
  monthly_transaction_limit numeric DEFAULT 3000 NOT NULL,
  single_transaction_limit numeric DEFAULT 500 NOT NULL,
  features_enabled jsonb DEFAULT '{"send": false, "receive": true, "virtual_card": false, "international": false}'::jsonb NOT NULL,
  upgraded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_risk_tiers_user_id_key UNIQUE (user_id),
  CONSTRAINT user_risk_tiers_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_tiers TO authenticated;
GRANT ALL ON public.user_risk_tiers TO service_role;
ALTER TABLE public.user_risk_tiers ENABLE ROW LEVEL SECURITY;

-- TABLE: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- TABLE: vendors
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(255) NOT NULL,
  email character varying(255),
  phone character varying(50),
  address text,
  tax_id character varying(100),
  payment_terms integer DEFAULT 30,
  currency_code character varying(10) DEFAULT 'USD'::character varying,
  bank_account character varying(100),
  bank_name character varying(255),
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT vendors_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- TABLE: virtual_accounts
CREATE TABLE IF NOT EXISTS public.virtual_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  wallet_id uuid,
  currency_code character varying(10) NOT NULL,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  flw_order_ref text,
  flw_response jsonb,
  is_permanent boolean DEFAULT true NOT NULL,
  expires_at timestamp with time zone,
  status virtual_account_status DEFAULT 'active'::virtual_account_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT virtual_accounts_account_number_key UNIQUE (account_number),
  CONSTRAINT virtual_accounts_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.virtual_accounts TO authenticated;
GRANT ALL ON public.virtual_accounts TO service_role;
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;

-- TABLE: wallet_operations
CREATE TABLE IF NOT EXISTS public.wallet_operations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wallet_id uuid NOT NULL,
  operation_type character varying(50) NOT NULL,
  reason text NOT NULL,
  performed_by uuid NOT NULL,
  approved_by uuid,
  approval_required boolean DEFAULT false NOT NULL,
  approved_at timestamp with time zone,
  notes text,
  previous_status character varying(50),
  new_status character varying(50),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT wallet_operations_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_operations_operation_type_check CHECK (((operation_type)::text = ANY ((ARRAY['freeze'::character varying, 'unfreeze'::character varying, 'restrict_inbound'::character varying, 'restrict_outbound'::character varying, 'close'::character varying, 'reactivate'::character varying])::text[])))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_operations TO authenticated;
GRANT ALL ON public.wallet_operations TO service_role;
ALTER TABLE public.wallet_operations ENABLE ROW LEVEL SECURITY;

-- TABLE: wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  currency_code character varying(10) NOT NULL,
  status wallet_status DEFAULT 'active'::wallet_status NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  stellar_address text,
  CONSTRAINT wallets_user_id_currency_code_key UNIQUE (user_id, currency_code),
  CONSTRAINT wallets_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- TABLE: webhook_events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  event_type text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- TABLE: webhooks_inbox
CREATE TABLE IF NOT EXISTS public.webhooks_inbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  event_type text,
  external_reference text,
  transfer_id uuid,
  payload jsonb NOT NULL,
  headers jsonb,
  status text DEFAULT 'received'::text NOT NULL,
  processing_error text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  CONSTRAINT webhooks_inbox_pkey PRIMARY KEY (id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks_inbox TO authenticated;
GRANT ALL ON public.webhooks_inbox TO service_role;
ALTER TABLE public.webhooks_inbox ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 4. FOREIGN KEY CONSTRAINTS
-- =====================================================================

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_id_fkey;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.aml_matches DROP CONSTRAINT IF EXISTS aml_matches_screening_id_fkey;
ALTER TABLE public.aml_matches ADD CONSTRAINT aml_matches_screening_id_fkey FOREIGN KEY (screening_id) REFERENCES aml_screenings(id) ON DELETE CASCADE;
ALTER TABLE public.aml_matches DROP CONSTRAINT IF EXISTS aml_matches_watchlist_id_fkey;
ALTER TABLE public.aml_matches ADD CONSTRAINT aml_matches_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES aml_watchlist(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_currency_code_fkey;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_ledger_account_id_fkey;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_ledger_account_id_fkey FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_bank_account_id_fkey;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_credit_account_id_fkey;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_debit_account_id_fkey;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_debit_account_id_fkey FOREIGN KEY (debit_account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_rule_id_fkey;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES transaction_rules(id);
ALTER TABLE public.bill_payments DROP CONSTRAINT IF EXISTS bill_payments_wallet_id_fkey;
ALTER TABLE public.bill_payments ADD CONSTRAINT bill_payments_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id);
ALTER TABLE public.business_card_members DROP CONSTRAINT IF EXISTS business_card_members_program_id_fkey;
ALTER TABLE public.business_card_members ADD CONSTRAINT business_card_members_program_id_fkey FOREIGN KEY (program_id) REFERENCES business_card_programs(id) ON DELETE CASCADE;
ALTER TABLE public.business_card_members DROP CONSTRAINT IF EXISTS business_card_members_user_id_fkey;
ALTER TABLE public.business_card_members ADD CONSTRAINT business_card_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.business_card_programs DROP CONSTRAINT IF EXISTS business_card_programs_funding_wallet_id_fkey;
ALTER TABLE public.business_card_programs ADD CONSTRAINT business_card_programs_funding_wallet_id_fkey FOREIGN KEY (funding_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE public.business_card_programs DROP CONSTRAINT IF EXISTS business_card_programs_owner_user_id_fkey;
ALTER TABLE public.business_card_programs ADD CONSTRAINT business_card_programs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.card_authorizations DROP CONSTRAINT IF EXISTS card_authorizations_card_id_fkey;
ALTER TABLE public.card_authorizations ADD CONSTRAINT card_authorizations_card_id_fkey FOREIGN KEY (card_id) REFERENCES issued_cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_authorizations DROP CONSTRAINT IF EXISTS card_authorizations_user_id_fkey;
ALTER TABLE public.card_authorizations ADD CONSTRAINT card_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.card_fraud_signals DROP CONSTRAINT IF EXISTS card_fraud_signals_authorization_id_fkey;
ALTER TABLE public.card_fraud_signals ADD CONSTRAINT card_fraud_signals_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES card_authorizations(id) ON DELETE SET NULL;
ALTER TABLE public.card_fraud_signals DROP CONSTRAINT IF EXISTS card_fraud_signals_card_id_fkey;
ALTER TABLE public.card_fraud_signals ADD CONSTRAINT card_fraud_signals_card_id_fkey FOREIGN KEY (card_id) REFERENCES issued_cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_fraud_signals DROP CONSTRAINT IF EXISTS card_fraud_signals_user_id_fkey;
ALTER TABLE public.card_fraud_signals ADD CONSTRAINT card_fraud_signals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.card_funding_events DROP CONSTRAINT IF EXISTS card_funding_events_card_id_fkey;
ALTER TABLE public.card_funding_events ADD CONSTRAINT card_funding_events_card_id_fkey FOREIGN KEY (card_id) REFERENCES issued_cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_funding_events DROP CONSTRAINT IF EXISTS card_funding_events_source_wallet_id_fkey;
ALTER TABLE public.card_funding_events ADD CONSTRAINT card_funding_events_source_wallet_id_fkey FOREIGN KEY (source_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE public.card_funding_events DROP CONSTRAINT IF EXISTS card_funding_events_user_id_fkey;
ALTER TABLE public.card_funding_events ADD CONSTRAINT card_funding_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.card_spending_controls DROP CONSTRAINT IF EXISTS card_spending_controls_card_id_fkey;
ALTER TABLE public.card_spending_controls ADD CONSTRAINT card_spending_controls_card_id_fkey FOREIGN KEY (card_id) REFERENCES issued_cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_transactions DROP CONSTRAINT IF EXISTS card_transactions_authorization_id_fkey;
ALTER TABLE public.card_transactions ADD CONSTRAINT card_transactions_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES card_authorizations(id) ON DELETE SET NULL;
ALTER TABLE public.card_transactions DROP CONSTRAINT IF EXISTS card_transactions_card_id_fkey;
ALTER TABLE public.card_transactions ADD CONSTRAINT card_transactions_card_id_fkey FOREIGN KEY (card_id) REFERENCES issued_cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_transactions DROP CONSTRAINT IF EXISTS card_transactions_user_id_fkey;
ALTER TABLE public.card_transactions ADD CONSTRAINT card_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cardholders DROP CONSTRAINT IF EXISTS cardholders_user_id_fkey;
ALTER TABLE public.cardholders ADD CONSTRAINT cardholders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_user_id_fkey;
ALTER TABLE public.cards ADD CONSTRAINT cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_wallet_id_fkey;
ALTER TABLE public.cards ADD CONSTRAINT cards_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_assigned_to_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_resolved_by_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_rule_id_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES compliance_rules(id);
ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_transfer_id_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id);
ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_user_id_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_reports DROP CONSTRAINT IF EXISTS compliance_reports_filed_by_fkey;
ALTER TABLE public.compliance_reports ADD CONSTRAINT compliance_reports_filed_by_fkey FOREIGN KEY (filed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_assigned_to_fkey;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_created_by_fkey;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_customer_id_fkey;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.crypto_pairs DROP CONSTRAINT IF EXISTS crypto_pairs_base_currency_fkey;
ALTER TABLE public.crypto_pairs ADD CONSTRAINT crypto_pairs_base_currency_fkey FOREIGN KEY (base_currency) REFERENCES currencies(code);
ALTER TABLE public.crypto_pairs DROP CONSTRAINT IF EXISTS crypto_pairs_quote_currency_fkey;
ALTER TABLE public.crypto_pairs ADD CONSTRAINT crypto_pairs_quote_currency_fkey FOREIGN KEY (quote_currency) REFERENCES currencies(code);
ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_base_wallet_id_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_base_wallet_id_fkey FOREIGN KEY (base_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_fee_currency_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_fee_currency_fkey FOREIGN KEY (fee_currency) REFERENCES currencies(code);
ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_pair_id_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_pair_id_fkey FOREIGN KEY (pair_id) REFERENCES crypto_pairs(id);
ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_quote_wallet_id_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_quote_wallet_id_fkey FOREIGN KEY (quote_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_user_id_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.customer_communications DROP CONSTRAINT IF EXISTS customer_communications_customer_id_fkey;
ALTER TABLE public.customer_communications ADD CONSTRAINT customer_communications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS customer_documents_customer_id_fkey;
ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS customer_documents_onboarding_id_fkey;
ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_onboarding_id_fkey FOREIGN KEY (onboarding_id) REFERENCES customer_onboarding(id);
ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS customer_documents_reviewed_by_fkey;
ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.customer_onboarding DROP CONSTRAINT IF EXISTS customer_onboarding_customer_id_fkey;
ALTER TABLE public.customer_onboarding ADD CONSTRAINT customer_onboarding_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_onboarding DROP CONSTRAINT IF EXISTS customer_onboarding_reviewed_by_fkey;
ALTER TABLE public.customer_onboarding ADD CONSTRAINT customer_onboarding_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.customer_onboarding DROP CONSTRAINT IF EXISTS customer_onboarding_step_id_fkey;
ALTER TABLE public.customer_onboarding ADD CONSTRAINT customer_onboarding_step_id_fkey FOREIGN KEY (step_id) REFERENCES onboarding_steps(id);
ALTER TABLE public.customer_portal_access DROP CONSTRAINT IF EXISTS customer_portal_access_customer_id_fkey;
ALTER TABLE public.customer_portal_access ADD CONSTRAINT customer_portal_access_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_portal_access DROP CONSTRAINT IF EXISTS customer_portal_access_user_id_fkey;
ALTER TABLE public.customer_portal_access ADD CONSTRAINT customer_portal_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_kyc_verified_by_fkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_kyc_verified_by_fkey FOREIGN KEY (kyc_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_customer_id_fkey;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_transaction_id_fkey;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transfers(id);
ALTER TABLE public.fx_rates DROP CONSTRAINT IF EXISTS fx_rates_from_currency_fkey;
ALTER TABLE public.fx_rates ADD CONSTRAINT fx_rates_from_currency_fkey FOREIGN KEY (from_currency) REFERENCES currencies(code);
ALTER TABLE public.fx_rates DROP CONSTRAINT IF EXISTS fx_rates_to_currency_fkey;
ALTER TABLE public.fx_rates ADD CONSTRAINT fx_rates_to_currency_fkey FOREIGN KEY (to_currency) REFERENCES currencies(code);
ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_from_currency_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_from_currency_fkey FOREIGN KEY (from_currency) REFERENCES currencies(code);
ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_from_wallet_id_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_from_wallet_id_fkey FOREIGN KEY (from_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_to_currency_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_to_currency_fkey FOREIGN KEY (to_currency) REFERENCES currencies(code);
ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_to_wallet_id_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_to_wallet_id_fkey FOREIGN KEY (to_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_user_id_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.input_tax_credits DROP CONSTRAINT IF EXISTS input_tax_credits_vendor_id_fkey;
ALTER TABLE public.input_tax_credits ADD CONSTRAINT input_tax_credits_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE public.intra_ca_transfers DROP CONSTRAINT IF EXISTS intra_ca_transfers_destination_wallet_id_fkey;
ALTER TABLE public.intra_ca_transfers ADD CONSTRAINT intra_ca_transfers_destination_wallet_id_fkey FOREIGN KEY (destination_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.intra_ca_transfers DROP CONSTRAINT IF EXISTS intra_ca_transfers_plaid_account_id_fkey;
ALTER TABLE public.intra_ca_transfers ADD CONSTRAINT intra_ca_transfers_plaid_account_id_fkey FOREIGN KEY (plaid_account_id) REFERENCES plaid_accounts(id);
ALTER TABLE public.intra_ca_transfers DROP CONSTRAINT IF EXISTS intra_ca_transfers_user_id_fkey;
ALTER TABLE public.intra_ca_transfers ADD CONSTRAINT intra_ca_transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.issued_cards DROP CONSTRAINT IF EXISTS issued_cards_cardholder_id_fkey;
ALTER TABLE public.issued_cards ADD CONSTRAINT issued_cards_cardholder_id_fkey FOREIGN KEY (cardholder_id) REFERENCES cardholders(id) ON DELETE RESTRICT;
ALTER TABLE public.issued_cards DROP CONSTRAINT IF EXISTS issued_cards_funding_wallet_id_fkey;
ALTER TABLE public.issued_cards ADD CONSTRAINT issued_cards_funding_wallet_id_fkey FOREIGN KEY (funding_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE public.issued_cards DROP CONSTRAINT IF EXISTS issued_cards_user_id_fkey;
ALTER TABLE public.issued_cards ADD CONSTRAINT issued_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.kyc_audit_log DROP CONSTRAINT IF EXISTS kyc_audit_log_admin_id_fkey;
ALTER TABLE public.kyc_audit_log ADD CONSTRAINT kyc_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public.kyc_audit_log DROP CONSTRAINT IF EXISTS kyc_audit_log_kyc_verification_id_fkey;
ALTER TABLE public.kyc_audit_log ADD CONSTRAINT kyc_audit_log_kyc_verification_id_fkey FOREIGN KEY (kyc_verification_id) REFERENCES kyc_verifications(id) ON DELETE CASCADE;
ALTER TABLE public.kyc_verifications DROP CONSTRAINT IF EXISTS kyc_verifications_reviewed_by_fkey;
ALTER TABLE public.kyc_verifications ADD CONSTRAINT kyc_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.kyc_verifications DROP CONSTRAINT IF EXISTS kyc_verifications_user_id_fkey;
ALTER TABLE public.kyc_verifications ADD CONSTRAINT kyc_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_currency_code_fkey;
ALTER TABLE public.ledger_accounts ADD CONSTRAINT ledger_accounts_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
ALTER TABLE public.ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_parent_id_fkey;
ALTER TABLE public.ledger_accounts ADD CONSTRAINT ledger_accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_account_id_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_created_by_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_code_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_wallet_id_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id);
ALTER TABLE public.plaid_accounts DROP CONSTRAINT IF EXISTS plaid_accounts_item_id_fkey;
ALTER TABLE public.plaid_accounts ADD CONSTRAINT plaid_accounts_item_id_fkey FOREIGN KEY (item_id) REFERENCES plaid_items(id) ON DELETE CASCADE;
ALTER TABLE public.plaid_accounts DROP CONSTRAINT IF EXISTS plaid_accounts_user_id_fkey;
ALTER TABLE public.plaid_accounts ADD CONSTRAINT plaid_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.plaid_items DROP CONSTRAINT IF EXISTS plaid_items_user_id_fkey;
ALTER TABLE public.plaid_items ADD CONSTRAINT plaid_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_default_currency_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_default_currency_fkey FOREIGN KEY (default_currency) REFERENCES currencies(code);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_bill_items DROP CONSTRAINT IF EXISTS purchase_bill_items_account_id_fkey;
ALTER TABLE public.purchase_bill_items ADD CONSTRAINT purchase_bill_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.purchase_bill_items DROP CONSTRAINT IF EXISTS purchase_bill_items_bill_id_fkey;
ALTER TABLE public.purchase_bill_items ADD CONSTRAINT purchase_bill_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_bills DROP CONSTRAINT IF EXISTS purchase_bills_vendor_id_fkey;
ALTER TABLE public.purchase_bills ADD CONSTRAINT purchase_bills_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE public.reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_bank_transaction_id_fkey;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id);
ALTER TABLE public.reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_ledger_entry_id_fkey;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id);
ALTER TABLE public.reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_resolved_by_fkey;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_transfer_id_fkey;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id);
ALTER TABLE public.regulatory_reports DROP CONSTRAINT IF EXISTS regulatory_reports_subject_customer_id_fkey;
ALTER TABLE public.regulatory_reports ADD CONSTRAINT regulatory_reports_subject_customer_id_fkey FOREIGN KEY (subject_customer_id) REFERENCES customers(id);
ALTER TABLE public.sales_invoice_items DROP CONSTRAINT IF EXISTS sales_invoice_items_account_id_fkey;
ALTER TABLE public.sales_invoice_items ADD CONSTRAINT sales_invoice_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.sales_invoice_items DROP CONSTRAINT IF EXISTS sales_invoice_items_invoice_id_fkey;
ALTER TABLE public.sales_invoice_items ADD CONSTRAINT sales_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_customer_id_fkey;
ALTER TABLE public.sales_invoices ADD CONSTRAINT sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.saved_payment_methods DROP CONSTRAINT IF EXISTS saved_payment_methods_user_id_fkey;
ALTER TABLE public.saved_payment_methods ADD CONSTRAINT saved_payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_connected_accounts DROP CONSTRAINT IF EXISTS stripe_connected_accounts_user_id_fkey;
ALTER TABLE public.stripe_connected_accounts ADD CONSTRAINT stripe_connected_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sumsub_verifications DROP CONSTRAINT IF EXISTS sumsub_verifications_requested_by_admin_id_fkey;
ALTER TABLE public.sumsub_verifications ADD CONSTRAINT sumsub_verifications_requested_by_admin_id_fkey FOREIGN KEY (requested_by_admin_id) REFERENCES auth.users(id);
ALTER TABLE public.sumsub_verifications DROP CONSTRAINT IF EXISTS sumsub_verifications_user_id_fkey;
ALTER TABLE public.sumsub_verifications ADD CONSTRAINT sumsub_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tax_transactions DROP CONSTRAINT IF EXISTS tax_transactions_customer_id_fkey;
ALTER TABLE public.tax_transactions ADD CONSTRAINT tax_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.transaction_interventions DROP CONSTRAINT IF EXISTS transaction_interventions_transfer_id_fkey;
ALTER TABLE public.transaction_interventions ADD CONSTRAINT transaction_interventions_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id);
ALTER TABLE public.transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_credit_account_id_fkey;
ALTER TABLE public.transaction_rules ADD CONSTRAINT transaction_rules_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_debit_account_id_fkey;
ALTER TABLE public.transaction_rules ADD CONSTRAINT transaction_rules_debit_account_id_fkey FOREIGN KEY (debit_account_id) REFERENCES ledger_accounts(id);
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_sender_id_fkey;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_sender_wallet_id_fkey;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_sender_wallet_id_fkey FOREIGN KEY (sender_wallet_id) REFERENCES wallets(id);
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_source_currency_fkey;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_source_currency_fkey FOREIGN KEY (source_currency) REFERENCES currencies(code);
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_target_currency_fkey;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_target_currency_fkey FOREIGN KEY (target_currency) REFERENCES currencies(code);
ALTER TABLE public.treasury_financial_accounts DROP CONSTRAINT IF EXISTS treasury_financial_accounts_user_id_fkey;
ALTER TABLE public.treasury_financial_accounts ADD CONSTRAINT treasury_financial_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.treasury_received_entries DROP CONSTRAINT IF EXISTS treasury_received_entries_fa_id_fkey;
ALTER TABLE public.treasury_received_entries ADD CONSTRAINT treasury_received_entries_fa_id_fkey FOREIGN KEY (fa_id) REFERENCES treasury_financial_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.treasury_received_entries DROP CONSTRAINT IF EXISTS treasury_received_entries_user_id_fkey;
ALTER TABLE public.treasury_received_entries ADD CONSTRAINT treasury_received_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.treasury_transfers DROP CONSTRAINT IF EXISTS treasury_transfers_fa_id_fkey;
ALTER TABLE public.treasury_transfers ADD CONSTRAINT treasury_transfers_fa_id_fkey FOREIGN KEY (fa_id) REFERENCES treasury_financial_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.treasury_transfers DROP CONSTRAINT IF EXISTS treasury_transfers_user_id_fkey;
ALTER TABLE public.treasury_transfers ADD CONSTRAINT treasury_transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_risk_tiers DROP CONSTRAINT IF EXISTS user_risk_tiers_user_id_fkey;
ALTER TABLE public.user_risk_tiers ADD CONSTRAINT user_risk_tiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.virtual_accounts DROP CONSTRAINT IF EXISTS virtual_accounts_wallet_id_fkey;
ALTER TABLE public.virtual_accounts ADD CONSTRAINT virtual_accounts_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
ALTER TABLE public.wallet_operations DROP CONSTRAINT IF EXISTS wallet_operations_wallet_id_fkey;
ALTER TABLE public.wallet_operations ADD CONSTRAINT wallet_operations_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id);
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_currency_code_fkey;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_user_id_fkey;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.webhooks_inbox DROP CONSTRAINT IF EXISTS webhooks_inbox_transfer_id_fkey;
ALTER TABLE public.webhooks_inbox ADD CONSTRAINT webhooks_inbox_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE SET NULL;


-- =====================================================================
-- 5. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_created ON public.admin_notifications USING btree (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aml_matches_disposition ON public.aml_matches USING btree (disposition);
CREATE INDEX IF NOT EXISTS idx_aml_matches_screening ON public.aml_matches USING btree (screening_id);
CREATE INDEX IF NOT EXISTS idx_aml_screenings_status ON public.aml_screenings USING btree (status);
CREATE INDEX IF NOT EXISTS idx_aml_screenings_user ON public.aml_screenings USING btree (user_id, screened_at DESC);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_aliases ON public.aml_watchlist USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_name_trgm ON public.aml_watchlist USING gin (name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_source ON public.aml_watchlist USING btree (source);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_categorized_posted ON public.bank_transactions USING btree (is_categorized, is_posted);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_id ON public.beneficiaries USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_phone ON public.beneficiaries USING btree (user_id, phone);
CREATE INDEX IF NOT EXISTS idx_bill_payments_user ON public.bill_payments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_biz_member_program ON public.business_card_members USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_biz_member_user ON public.business_card_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_biz_program_owner ON public.business_card_programs USING btree (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_card_auth_card ON public.card_authorizations USING btree (card_id);
CREATE INDEX IF NOT EXISTS idx_card_auth_user ON public.card_authorizations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_card_fraud_card ON public.card_fraud_signals USING btree (card_id);
CREATE INDEX IF NOT EXISTS idx_card_funding_card ON public.card_funding_events USING btree (card_id);
CREATE INDEX IF NOT EXISTS idx_card_txn_card ON public.card_transactions USING btree (card_id);
CREATE INDEX IF NOT EXISTS idx_card_txn_user ON public.card_transactions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cardholders_user ON public.cardholders USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON public.cards USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON public.cards USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cmyc_order ON public.crossmint_yellowcard_transfers USING btree (crossmint_order_id);
CREATE INDEX IF NOT EXISTS idx_cmyc_status ON public.crossmint_yellowcard_transfers USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cmyc_user ON public.crossmint_yellowcard_transfers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_communications_customer ON public.customer_communications USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_customer ON public.disputes USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_disputes_transaction ON public.disputes USING btree (transaction_id);
CREATE INDEX IF NOT EXISTS idx_interac_sessions_expires ON public.interac_sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_intra_ca_transfers_user ON public.intra_ca_transfers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_issued_cards_user ON public.issued_cards USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_issued_cards_wallet ON public.issued_cards USING btree (funding_wallet_id);
CREATE INDEX IF NOT EXISTS idx_kyc_persona_inquiry_id ON public.kyc_verifications USING btree (persona_inquiry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ext_ref ON public.ledger_entries USING btree (reference_type, external_reference);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_external_ref_per_account ON public.ledger_entries USING btree (reference_type, external_reference, account_id) WHERE (external_reference IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_linked_funding_sources_user ON public.linked_funding_sources USING btree (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_maker_checker_status ON public.maker_checker_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_created_at ON public.paysafe_webhook_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_event_type ON public.paysafe_webhook_logs USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_merchant_ref ON public.paysafe_webhook_logs USING btree (merchant_ref_num);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_payment_id ON public.paysafe_webhook_logs USING btree (payment_id);
CREATE INDEX IF NOT EXISTS idx_persona_webhook_logs_inquiry ON public.persona_webhook_logs USING btree (inquiry_id);
CREATE INDEX IF NOT EXISTS idx_persona_webhook_logs_received_at ON public.persona_webhook_logs USING btree (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user ON public.plaid_accounts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON public.plaid_items USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_number_unique ON public.profiles USING btree (account_number) WHERE (account_number IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_efin_tag_lower_uidx ON public.profiles USING btree (lower(efin_tag)) WHERE (efin_tag IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stellar_public_key_key ON public.profiles USING btree (stellar_public_key) WHERE (stellar_public_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON public.rate_limits USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_regulatory_reports_status ON public.regulatory_reports USING btree (status);
CREATE INDEX IF NOT EXISTS saved_payment_methods_user_id_idx ON public.saved_payment_methods USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON public.savings_goals USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS idx_short_links_owner ON public.short_links USING btree (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_connected_accounts_user_unique ON public.stripe_connected_accounts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payin_sessions_session ON public.stripe_payin_sessions USING btree (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payin_sessions_user ON public.stripe_payin_sessions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_payout_recipients_user ON public.stripe_payout_recipients USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sumsub_verifications_user ON public.sumsub_verifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sumsub_webhook_logs_applicant ON public.sumsub_webhook_logs USING btree (applicant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_interventions_transfer ON public.transaction_interventions USING btree (transfer_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_active_priority ON public.transaction_rules USING btree (is_active, priority);
CREATE INDEX IF NOT EXISTS idx_transfers_circle_status ON public.transfers USING btree (circle_status);
CREATE INDEX IF NOT EXISTS idx_transfers_circle_transfer_id ON public.transfers USING btree (circle_transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_stellar_tx_hash ON public.transfers USING btree (stellar_tx_hash) WHERE (stellar_tx_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS treasury_fa_owner_idx ON public.treasury_financial_accounts USING btree (owner_kind);
CREATE INDEX IF NOT EXISTS treasury_fa_user_idx ON public.treasury_financial_accounts USING btree (user_id);
CREATE INDEX IF NOT EXISTS treasury_received_fa_idx ON public.treasury_received_entries USING btree (fa_id);
CREATE INDEX IF NOT EXISTS treasury_received_user_idx ON public.treasury_received_entries USING btree (user_id);
CREATE INDEX IF NOT EXISTS treasury_transfers_fa_idx ON public.treasury_transfers USING btree (fa_id);
CREATE INDEX IF NOT EXISTS treasury_transfers_status_idx ON public.treasury_transfers USING btree (status);
CREATE INDEX IF NOT EXISTS treasury_transfers_user_idx ON public.treasury_transfers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user ON public.virtual_accounts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_accounts_wallet ON public.virtual_accounts USING btree (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_operations_wallet ON public.wallet_operations USING btree (wallet_id);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_stellar_address_key ON public.wallets USING btree (stellar_address) WHERE (stellar_address IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_external_ref ON public.webhooks_inbox USING btree (external_reference);
CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_provider ON public.webhooks_inbox USING btree (provider);
CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_transfer ON public.webhooks_inbox USING btree (transfer_id);


-- =====================================================================
-- 6. DATABASE FUNCTIONS
--   Includes: handle_new_user, has_role, is_admin_user, is_kyc_reviewer,
--   is_super_admin, get_wallet_balance, get_user_wallet_balances,
--   execute_fx_swap, check_transfer_balance, run_compliance_checks,
--   on_kyc_status_change, create_short_link, resolve_short_link,
--   aml_normalize_name, tg_transfers_aml_screen, check_rate_limit,
--   invoke_send_email, invoke_generate_receipt, invoke_aml_screen, etc.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._gen_short_code(p_len integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_code text := '';
  v_bytes bytea;
  i int;
BEGIN
  v_bytes := gen_random_bytes(p_len);
  FOR i IN 0..p_len-1 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 62) + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.aml_normalize_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9 ]', ' ', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key character varying, p_max_requests integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count INT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Clean up expired entries (opportunistic cleanup)
    DELETE FROM rate_limits WHERE expires_at < now();
    
    -- Check current count for the key
    SELECT count, expires_at INTO v_count, v_expires_at
    FROM rate_limits
    WHERE key = p_key AND expires_at > now();
    
    IF v_count IS NULL THEN
        -- First request in window, create entry
        INSERT INTO rate_limits (key, count, expires_at)
        VALUES (p_key, 1, now() + (p_window_seconds || ' seconds')::interval)
        ON CONFLICT (key) DO UPDATE SET
            count = CASE 
                WHEN rate_limits.expires_at < now() THEN 1
                ELSE rate_limits.count + 1
            END,
            expires_at = CASE
                WHEN rate_limits.expires_at < now() THEN now() + (p_window_seconds || ' seconds')::interval
                ELSE rate_limits.expires_at
            END;
        RETURN TRUE;
    ELSIF v_count >= p_max_requests THEN
        -- Rate limit exceeded
        RETURN FALSE;
    ELSE
        -- Increment count
        UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
        RETURN TRUE;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_transfer_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_status wallet_status;
  v_owner uuid;
BEGIN
  -- Skip balance check for non-wallet funded transfers (card/bank)
  IF NEW.funding_source IS DISTINCT FROM 'wallet' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, status INTO v_owner, v_status
  FROM public.wallets WHERE id = NEW.sender_wallet_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Source wallet not found';
  END IF;

  IF v_status IS DISTINCT FROM 'active'::wallet_status THEN
    RAISE EXCEPTION 'Wallet is not active (status: %)', v_status;
  END IF;

  SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
  INTO v_balance
  FROM public.ledger_entries
  WHERE wallet_id = NEW.sender_wallet_id;

  IF (NEW.source_amount + COALESCE(NEW.fee_amount, 0)) > v_balance THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_short_link(p_target_path text, p_params jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_max_uses integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_len int := 6;
  v_attempts int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_path IS NULL OR p_target_path = '' OR left(p_target_path, 1) <> '/' THEN
    RAISE EXCEPTION 'target_path must be an absolute path starting with /';
  END IF;

  IF NOT public.check_rate_limit('shortlink:' || v_uid::text, 30, 60) THEN
    RAISE EXCEPTION 'Too many short links created, please slow down';
  END IF;

  LOOP
    v_code := public._gen_short_code(v_len);
    BEGIN
      INSERT INTO public.short_links(code, owner_id, target_path, params, expires_at, max_uses)
      VALUES (v_code, v_uid, p_target_path, COALESCE(p_params, '{}'::jsonb), p_expires_at, p_max_uses);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN v_len := 8; END IF;
      IF v_attempts >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique short code';
      END IF;
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_default_saved_card()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.saved_payment_methods
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_fx_swap(p_user_id uuid, p_from_wallet_id uuid, p_to_wallet_id uuid, p_from_amount numeric, p_effective_rate numeric, p_fee_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_journal_id UUID := gen_random_uuid();
    v_from_currency VARCHAR(10);
    v_to_currency VARCHAR(10);
    v_to_amount DECIMAL;
    v_from_liability_account UUID;
    v_to_liability_account UUID;
    v_fx_revenue_account UUID;
    v_from_wallet_owner UUID;
    v_to_wallet_owner UUID;
BEGIN
    -- SECURITY CHECK: Verify caller is the user they claim to be
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot execute swap for another user';
    END IF;
    
    -- SECURITY CHECK: Verify both wallets belong to the authenticated user
    SELECT user_id INTO v_from_wallet_owner FROM wallets WHERE id = p_from_wallet_id;
    SELECT user_id INTO v_to_wallet_owner FROM wallets WHERE id = p_to_wallet_id;
    
    IF v_from_wallet_owner IS NULL OR v_to_wallet_owner IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    IF v_from_wallet_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Source wallet does not belong to you';
    END IF;
    
    IF v_to_wallet_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Destination wallet does not belong to you';
    END IF;
    
    -- Get wallet currencies
    SELECT currency_code INTO v_from_currency FROM wallets WHERE id = p_from_wallet_id;
    SELECT currency_code INTO v_to_currency FROM wallets WHERE id = p_to_wallet_id;
    
    -- Calculate to amount
    v_to_amount := (p_from_amount - p_fee_amount) * p_effective_rate;
    
    -- Get ledger accounts
    SELECT id INTO v_from_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_from_currency LIMIT 1;
    SELECT id INTO v_to_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_to_currency LIMIT 1;
    SELECT id INTO v_fx_revenue_account FROM ledger_accounts WHERE code = '4100';
    
    -- Debit from wallet (reduce liability to customer in from_currency)
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_from_liability_account, p_from_wallet_id, v_from_currency, p_from_amount, 0, 'FX Swap - Debit', 'fx', p_user_id);
    
    -- Credit to wallet (increase liability to customer in to_currency)
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_to_liability_account, p_to_wallet_id, v_to_currency, 0, v_to_amount, 'FX Swap - Credit', 'fx', p_user_id);
    
    -- Record FX revenue (fee)
    IF p_fee_amount > 0 THEN
        INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
        VALUES (v_journal_id, v_fx_revenue_account, NULL, v_from_currency, 0, p_fee_amount, 'FX Fee Revenue', 'fx', p_user_id);
    END IF;
    
    RETURN v_journal_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_account_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_wallet_balances(p_user_id uuid)
 RETURNS TABLE(wallet_id uuid, currency_code character varying, currency_name character varying, symbol character varying, flag_emoji character varying, balance numeric, status wallet_status, is_default boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY CHECK: Verify caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- SECURITY CHECK: Users can only view their own wallets, admins/finance can view all
    IF p_user_id != auth.uid() 
       AND NOT public.has_role(auth.uid(), 'admin') 
       AND NOT public.has_role(auth.uid(), 'finance') THEN
        RAISE EXCEPTION 'Unauthorized: Cannot view wallets for this user';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.id as wallet_id,
        w.currency_code,
        c.name as currency_name,
        c.symbol,
        c.flag_emoji,
        public.get_wallet_balance(w.id) as balance,
        w.status,
        w.is_default
    FROM public.wallets w
    JOIN public.currencies c ON w.currency_code = c.code
    WHERE w.user_id = p_user_id
    ORDER BY w.is_default DESC, c.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_wallet_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    balance DECIMAL(20, 8);
    v_owner_id UUID;
BEGIN
    -- SECURITY CHECK: Verify wallet exists and get owner
    SELECT user_id INTO v_owner_id FROM public.wallets WHERE id = p_wallet_id;
    
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    -- SECURITY CHECK: Verify caller is owner or has admin/finance role
    IF auth.uid() IS NOT NULL THEN
        IF v_owner_id != auth.uid() 
           AND NOT public.has_role(auth.uid(), 'admin') 
           AND NOT public.has_role(auth.uid(), 'finance') THEN
            RAISE EXCEPTION 'Unauthorized: Cannot view balance for this wallet';
        END IF;
    END IF;
    
    SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
    INTO balance
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id;
    
    RETURN balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, email, account_status, kyc_framework_version)
    VALUES (NEW.id, NEW.email, 'pending_verification', 2)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'USD', true),
        (NEW.id, 'CAD', false);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    INSERT INTO public.user_risk_tiers (
      user_id, current_tier,
      daily_transaction_limit, monthly_transaction_limit, single_transaction_limit,
      features_enabled
    )
    VALUES (
      NEW.id, 'tier_1', 500, 3000, 500,
      '{"receive":true,"send":true,"bills":true,"topup":true,"international":false,"virtual_card":false,"business":false}'::jsonb
    )
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
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- Allow if the caller is checking their own roles
  IF auth.uid() = _user_id THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  -- Check if caller is an admin (they can check anyone's roles)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;
  
  IF caller_is_admin THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  -- Deny access - user is not authorized to check other users' roles
  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_aml_screen(p_user_id uuid, p_trigger text, p_trigger_ref uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/aml-screen';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM';
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon),
    body := jsonb_build_object('user_id', p_user_id, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_aml_screen failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_generate_receipt(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/generate-receipt';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('transfer_id', p_transfer_id, 'email', true)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_generate_receipt failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_send_email(p_type text, p_to text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/send-email';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM';
BEGIN
  IF p_to IS NULL OR p_to = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('type', p_type, 'to', p_to, 'data', p_data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_send_email failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = _uid);
$function$
;

CREATE OR REPLACE FUNCTION public.is_business_program_owner(_program_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.business_card_programs
    WHERE id = _program_id AND owner_user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_kyc_reviewer(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _uid AND role IN ('super_admin','compliance_officer')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _uid AND role = 'super_admin'::admin_user_role
  );
$function$
;

CREATE OR REPLACE FUNCTION public.lookup_efin_recipient(p_query text)
 RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email text, account_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_query text;
  v_digits text;
  v_caller uuid := auth.uid();
  v_rl_key text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := lower(btrim(coalesce(p_query, '')));
  IF length(v_query) < 3 THEN
    RETURN;
  END IF;

  v_rl_key := 'efin_lookup:' || v_caller::text;
  IF NOT public.check_rate_limit(v_rl_key, 30, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;

  v_digits := regexp_replace(v_query, '\D', '', 'g');

  RETURN QUERY
    SELECT p.user_id,
           p.full_name::text,
           p.efin_tag::text,
           p.avatar_url::text,
           p.email::text,
           p.account_number::text
      FROM public.profiles p
     WHERE p.user_id <> v_caller
       AND (
         lower(p.email) = v_query
         OR lower(p.efin_tag) = v_query
         OR (length(v_digits) >= 6 AND p.account_number = v_digits)
       )
     LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_compliance_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    NEW.user_id,
    'Compliance Alert',
    format('A %s severity compliance alert was raised on your account.', NEW.severity),
    'compliance',
    false
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_kyc_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      NEW.user_id,
      'KYC Status Updated',
      format('Your KYC status is now: %s', NEW.kyc_status),
      'kyc',
      false
    );

    PERFORM public.invoke_send_email(
      'kyc_update',
      NEW.email,
      jsonb_build_object('status', NEW.kyc_status, 'tier', NEW.kyc_tier)
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_transfer_completed_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.invoke_generate_receipt(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_transfer_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_message text;
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_title := 'Transfer Initiated';
    v_message := format('Your transfer of %s %s to %s has been initiated.',
      NEW.source_amount, NEW.source_currency, NEW.recipient_name);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'completed' THEN
      v_title := 'Transfer Completed';
      v_message := format('Your transfer of %s %s to %s is completed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);

      SELECT email INTO v_email FROM public.profiles WHERE user_id = NEW.sender_id;
      PERFORM public.invoke_send_email(
        'transfer_completed',
        v_email,
        jsonb_build_object(
          'recipient_name', NEW.recipient_name,
          'source_amount', NEW.source_amount,
          'source_currency', NEW.source_currency,
          'reference', COALESCE(NEW.provider_reference, NEW.id::text),
          'id', NEW.id
        )
      );
    ELSIF NEW.status::text = 'failed' THEN
      v_title := 'Transfer Failed';
      v_message := format('Your transfer of %s %s to %s has failed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSIF NEW.status::text = 'cancelled' THEN
      v_title := 'Transfer Cancelled';
      v_message := format('Your transfer of %s %s to %s was cancelled.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (NEW.sender_id, v_title, v_message, 'transfer', false);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.on_kyc_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acct text;
  v_has_acct text;
  v_new_tier text;
  v_limits public.tier_limits%ROWTYPE;
  v_should_run boolean := false;
BEGIN
  -- Re-evaluate tier whenever the verification is approved AND any of the
  -- relevant fields changed. Previously we only fired on a status transition
  -- to 'approved', which meant a Tier 2 user being upgraded to Tier 3 (status
  -- already 'approved', only address_verification_status changes) was ignored.
  IF NEW.verification_status = 'approved' THEN
    IF OLD.verification_status IS DISTINCT FROM NEW.verification_status
       OR OLD.id_verification_status IS DISTINCT FROM NEW.id_verification_status
       OR OLD.address_verification_status IS DISTINCT FROM NEW.address_verification_status
       OR OLD.source_of_funds_status IS DISTINCT FROM NEW.source_of_funds_status THEN
      v_should_run := true;
    END IF;
  END IF;

  IF v_should_run THEN
    -- Tier_3 now only requires ID + address approved (matches approve-kyc
    -- 'id_and_address' scope). source_of_funds remains a soft signal but is
    -- no longer a hard gate.
    IF NEW.address_verification_status = 'approved'
       AND NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_3';
    ELSIF NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_2';
    END IF;

    IF v_new_tier IS NOT NULL THEN
      SELECT * INTO v_limits FROM public.tier_limits WHERE tier = v_new_tier::public.user_risk_tier;
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id, v_new_tier::public.user_risk_tier, v_limits.daily_limit, v_limits.monthly_limit, v_limits.single_limit, v_limits.features_enabled, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier = v_new_tier::public.user_risk_tier,
        daily_transaction_limit = v_limits.daily_limit,
        monthly_transaction_limit = v_limits.monthly_limit,
        single_transaction_limit = v_limits.single_limit,
        features_enabled = v_limits.features_enabled,
        upgraded_at = now(),
        updated_at = now();
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number = v_acct,
            account_status = 'active',
            kyc_completed_at = now(),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now()),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    END IF;

    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text,
            'framework_v2 → ' || COALESCE(v_new_tier,'no_tier_change'));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_account_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.account_number IS NOT NULL AND NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    -- Allow only when no auth context (system) or admin
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'account_number is read-only';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_short_link(p_code text)
 RETURNS TABLE(target_path text, params jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.short_links%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.short_links WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Link revoked' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Link expired' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.max_uses IS NOT NULL AND v_row.use_count >= v_row.max_uses THEN
    RAISE EXCEPTION 'Link usage exhausted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.short_links
     SET use_count = use_count + 1
   WHERE code = p_code;

  target_path := v_row.target_path;
  params := v_row.params;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_compliance_checks(p_transfer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer RECORD;
    v_rule RECORD;
    v_alert_count INTEGER := 0;
    v_daily_count INTEGER;
    v_daily_amount DECIMAL;
    v_period_hours INT;
    v_max_transactions INT;
    v_threshold_usd DECIMAL;
    v_window_hours INT;
    v_min_transactions INT;
BEGIN
    -- Get transfer details
    SELECT * INTO v_transfer FROM transfers WHERE id = p_transfer_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Check each active rule
    FOR v_rule IN SELECT * FROM compliance_rules WHERE is_active = true LOOP
        BEGIN -- Error handling block for each rule
            -- Velocity check (daily transaction count)
            IF v_rule.rule_type = 'velocity' THEN
                -- Safe extraction with validation
                v_period_hours := COALESCE((v_rule.parameters->>'period_hours')::int, 24);
                v_max_transactions := COALESCE((v_rule.parameters->>'max_transactions')::int, 10);
                
                -- Bounds checking
                IF v_period_hours < 1 OR v_period_hours > 720 THEN
                    RAISE WARNING 'Invalid period_hours in rule %: %, skipping', v_rule.id, v_period_hours;
                    CONTINUE;
                END IF;
                
                IF v_max_transactions < 1 OR v_max_transactions > 10000 THEN
                    RAISE WARNING 'Invalid max_transactions in rule %: %, skipping', v_rule.id, v_max_transactions;
                    CONTINUE;
                END IF;
                
                SELECT COUNT(*) INTO v_daily_count
                FROM transfers
                WHERE sender_id = v_transfer.sender_id
                  AND created_at > now() - (v_period_hours * interval '1 hour');
                
                IF v_daily_count > v_max_transactions THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity, 
                        jsonb_build_object('daily_count', v_daily_count, 'threshold', v_max_transactions));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
            -- Large amount check
            IF v_rule.rule_type = 'amount' THEN
                v_threshold_usd := COALESCE((v_rule.parameters->>'threshold_usd')::decimal, 10000);
                
                -- Bounds checking
                IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
                    RAISE WARNING 'Invalid threshold_usd in rule %: %, skipping', v_rule.id, v_threshold_usd;
                    CONTINUE;
                END IF;
                
                IF v_transfer.source_amount > v_threshold_usd THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                        jsonb_build_object('amount', v_transfer.source_amount, 'threshold', v_threshold_usd));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
            -- Structuring detection
            IF v_rule.rule_type = 'structuring' THEN
                v_window_hours := COALESCE((v_rule.parameters->>'window_hours')::int, 24);
                v_min_transactions := COALESCE((v_rule.parameters->>'min_transactions')::int, 3);
                v_threshold_usd := COALESCE((v_rule.parameters->>'threshold_usd')::decimal, 10000);
                
                -- Bounds checking
                IF v_window_hours < 1 OR v_window_hours > 720 THEN
                    RAISE WARNING 'Invalid window_hours in rule %: %, skipping', v_rule.id, v_window_hours;
                    CONTINUE;
                END IF;
                
                IF v_min_transactions < 1 OR v_min_transactions > 1000 THEN
                    RAISE WARNING 'Invalid min_transactions in rule %: %, skipping', v_rule.id, v_min_transactions;
                    CONTINUE;
                END IF;
                
                IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
                    RAISE WARNING 'Invalid threshold_usd in rule %: %, skipping', v_rule.id, v_threshold_usd;
                    CONTINUE;
                END IF;
                
                SELECT COUNT(*), COALESCE(SUM(source_amount), 0) INTO v_daily_count, v_daily_amount
                FROM transfers
                WHERE sender_id = v_transfer.sender_id
                  AND created_at > now() - (v_window_hours * interval '1 hour')
                  AND source_amount < v_threshold_usd;
                
                IF v_daily_count >= v_min_transactions 
                   AND v_daily_amount >= v_threshold_usd THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                        jsonb_build_object('transaction_count', v_daily_count, 'total_amount', v_daily_amount));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Log error and continue with next rule
                RAISE WARNING 'Error processing compliance rule %: %', v_rule.id, SQLERRM;
                CONTINUE;
        END;
    END LOOP;
    
    RETURN v_alert_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_transfers_aml_screen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.invoke_aml_screen(NEW.sender_id, 'transfer', NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_compliance_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.run_compliance_checks(NEW.id);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_compliance_parameters(p_rule_type character varying, p_parameters jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period_hours INT;
    v_max_transactions INT;
    v_threshold_usd DECIMAL;
    v_window_hours INT;
    v_min_transactions INT;
BEGIN
    IF p_rule_type = 'velocity' THEN
        -- Validate required keys exist
        IF NOT (p_parameters ? 'period_hours' AND p_parameters ? 'max_transactions') THEN
            RAISE EXCEPTION 'Velocity rule requires period_hours and max_transactions';
        END IF;
        
        -- Validate types and ranges with safe extraction
        BEGIN
            v_period_hours := (p_parameters->>'period_hours')::int;
            v_max_transactions := (p_parameters->>'max_transactions')::int;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value in velocity rule parameters';
        END;
        
        IF v_period_hours < 1 OR v_period_hours > 720 THEN
            RAISE EXCEPTION 'period_hours must be between 1 and 720';
        END IF;
        
        IF v_max_transactions < 1 OR v_max_transactions > 10000 THEN
            RAISE EXCEPTION 'max_transactions must be between 1 and 10000';
        END IF;
        
    ELSIF p_rule_type = 'amount' THEN
        IF NOT (p_parameters ? 'threshold_usd') THEN
            RAISE EXCEPTION 'Amount rule requires threshold_usd';
        END IF;
        
        BEGIN
            v_threshold_usd := (p_parameters->>'threshold_usd')::decimal;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value for threshold_usd';
        END;
        
        IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
            RAISE EXCEPTION 'threshold_usd must be between 0 and 10000000';
        END IF;
        
    ELSIF p_rule_type = 'structuring' THEN
        IF NOT (p_parameters ? 'threshold_usd' AND p_parameters ? 'window_hours' AND p_parameters ? 'min_transactions') THEN
            RAISE EXCEPTION 'Structuring rule requires threshold_usd, window_hours, and min_transactions';
        END IF;
        
        BEGIN
            v_threshold_usd := (p_parameters->>'threshold_usd')::decimal;
            v_window_hours := (p_parameters->>'window_hours')::int;
            v_min_transactions := (p_parameters->>'min_transactions')::int;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value in structuring rule parameters';
        END;
        
        IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
            RAISE EXCEPTION 'threshold_usd must be between 0 and 10000000';
        END IF;
        
        IF v_window_hours < 1 OR v_window_hours > 720 THEN
            RAISE EXCEPTION 'window_hours must be between 1 and 720';
        END IF;
        
        IF v_min_transactions < 1 OR v_min_transactions > 1000 THEN
            RAISE EXCEPTION 'min_transactions must be between 1 and 1000';
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$function$
;


-- =====================================================================
-- 7. TRIGGERS
-- =====================================================================

DROP TRIGGER IF EXISTS set_updated_at_admin_users ON public.admin_users;
CREATE TRIGGER set_updated_at_admin_users BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_beneficiaries_updated_at ON public.beneficiaries;
CREATE TRIGGER update_beneficiaries_updated_at BEFORE UPDATE ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_bill_payments_updated_at ON public.bill_payments;
CREATE TRIGGER update_bill_payments_updated_at BEFORE UPDATE ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_biz_program_updated ON public.business_card_programs;
CREATE TRIGGER trg_biz_program_updated BEFORE UPDATE ON public.business_card_programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_card_controls_updated ON public.card_spending_controls;
CREATE TRIGGER trg_card_controls_updated BEFORE UPDATE ON public.card_spending_controls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_cardholders_updated ON public.cardholders;
CREATE TRIGGER trg_cardholders_updated BEFORE UPDATE ON public.cardholders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_cards_updated_at ON public.cards;
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_notify_compliance_alert ON public.compliance_alerts;
CREATE TRIGGER trg_notify_compliance_alert AFTER INSERT ON public.compliance_alerts FOR EACH ROW EXECUTE FUNCTION notify_compliance_alert();
DROP TRIGGER IF EXISTS cpn_corridors_updated_at ON public.cpn_corridors;
CREATE TRIGGER cpn_corridors_updated_at BEFORE UPDATE ON public.cpn_corridors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_crm_activities_updated_at ON public.crm_activities;
CREATE TRIGGER update_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_crossmint_wallets_updated_at ON public.crossmint_wallets;
CREATE TRIGGER update_crossmint_wallets_updated_at BEFORE UPDATE ON public.crossmint_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_cmyc_updated_at ON public.crossmint_yellowcard_transfers;
CREATE TRIGGER update_cmyc_updated_at BEFORE UPDATE ON public.crossmint_yellowcard_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_customer_onboarding_updated_at ON public.customer_onboarding;
CREATE TRIGGER update_customer_onboarding_updated_at BEFORE UPDATE ON public.customer_onboarding FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_disputes_updated_at ON public.disputes;
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_integration_settings_updated_at ON public.integration_settings;
CREATE TRIGGER trg_integration_settings_updated_at BEFORE UPDATE ON public.integration_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_intra_ca_transfers_updated ON public.intra_ca_transfers;
CREATE TRIGGER trg_intra_ca_transfers_updated BEFORE UPDATE ON public.intra_ca_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_issued_cards_updated ON public.issued_cards;
CREATE TRIGGER trg_issued_cards_updated BEFORE UPDATE ON public.issued_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_kyc_verifications ON public.kyc_verifications;
CREATE TRIGGER set_updated_at_kyc_verifications BEFORE UPDATE ON public.kyc_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_on_kyc_status_change ON public.kyc_verifications;
CREATE TRIGGER trg_on_kyc_status_change AFTER UPDATE ON public.kyc_verifications FOR EACH ROW EXECUTE FUNCTION on_kyc_status_change();
DROP TRIGGER IF EXISTS trg_plaid_items_updated ON public.plaid_items;
CREATE TRIGGER trg_plaid_items_updated BEFORE UPDATE ON public.plaid_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_notify_kyc_status_change ON public.profiles;
CREATE TRIGGER trg_notify_kyc_status_change AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION notify_kyc_status_change();
DROP TRIGGER IF EXISTS trg_protect_account_number ON public.profiles;
CREATE TRIGGER trg_protect_account_number BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_account_number();
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_purchase_bills_updated_at ON public.purchase_bills;
CREATE TRIGGER update_purchase_bills_updated_at BEFORE UPDATE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_regulatory_reports_updated_at ON public.regulatory_reports;
CREATE TRIGGER update_regulatory_reports_updated_at BEFORE UPDATE ON public.regulatory_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_sales_invoices_updated_at ON public.sales_invoices;
CREATE TRIGGER update_sales_invoices_updated_at BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_single_default_saved_card ON public.saved_payment_methods;
CREATE TRIGGER trg_single_default_saved_card AFTER INSERT OR UPDATE OF is_default ON public.saved_payment_methods FOR EACH ROW EXECUTE FUNCTION enforce_single_default_saved_card();
DROP TRIGGER IF EXISTS update_savings_goals_updated_at ON public.savings_goals;
CREATE TRIGGER update_savings_goals_updated_at BEFORE UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_stripe_connected_accounts ON public.stripe_connected_accounts;
CREATE TRIGGER set_updated_at_stripe_connected_accounts BEFORE UPDATE ON public.stripe_connected_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_stripe_payin_sessions_updated_at ON public.stripe_payin_sessions;
CREATE TRIGGER trg_stripe_payin_sessions_updated_at BEFORE UPDATE ON public.stripe_payin_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_stripe_payout_recipients_updated_at ON public.stripe_payout_recipients;
CREATE TRIGGER set_stripe_payout_recipients_updated_at BEFORE UPDATE ON public.stripe_payout_recipients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_sumsub_verifications_updated_at ON public.sumsub_verifications;
CREATE TRIGGER trg_sumsub_verifications_updated_at BEFORE UPDATE ON public.sumsub_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_tax_filings_updated_at ON public.tax_filings;
CREATE TRIGGER update_tax_filings_updated_at BEFORE UPDATE ON public.tax_filings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_tax_registrations_updated_at ON public.tax_registrations;
CREATE TRIGGER update_tax_registrations_updated_at BEFORE UPDATE ON public.tax_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_tier_limits ON public.tier_limits;
CREATE TRIGGER set_updated_at_tier_limits BEFORE UPDATE ON public.tier_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_transaction_rules_updated_at ON public.transaction_rules;
CREATE TRIGGER update_transaction_rules_updated_at BEFORE UPDATE ON public.transaction_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS check_transfer_compliance ON public.transfers;
CREATE TRIGGER check_transfer_compliance AFTER INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION trigger_compliance_check();
DROP TRIGGER IF EXISTS trg_check_transfer_balance ON public.transfers;
CREATE TRIGGER trg_check_transfer_balance BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION check_transfer_balance();
DROP TRIGGER IF EXISTS trg_notify_transfer_event ON public.transfers;
CREATE TRIGGER trg_notify_transfer_event AFTER INSERT OR UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION notify_transfer_event();
DROP TRIGGER IF EXISTS trg_transfer_completed_receipt ON public.transfers;
CREATE TRIGGER trg_transfer_completed_receipt AFTER UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION notify_transfer_completed_receipt();
DROP TRIGGER IF EXISTS trg_transfers_aml_screen ON public.transfers;
CREATE TRIGGER trg_transfers_aml_screen AFTER INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION tg_transfers_aml_screen();
DROP TRIGGER IF EXISTS update_transfers_updated_at ON public.transfers;
CREATE TRIGGER update_transfers_updated_at BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS treasury_fa_updated ON public.treasury_financial_accounts;
CREATE TRIGGER treasury_fa_updated BEFORE UPDATE ON public.treasury_financial_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS treasury_received_updated ON public.treasury_received_entries;
CREATE TRIGGER treasury_received_updated BEFORE UPDATE ON public.treasury_received_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS treasury_transfers_updated ON public.treasury_transfers;
CREATE TRIGGER treasury_transfers_updated BEFORE UPDATE ON public.treasury_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_user_risk_tiers ON public.user_risk_tiers;
CREATE TRIGGER set_updated_at_user_risk_tiers BEFORE UPDATE ON public.user_risk_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_vendors_updated_at ON public.vendors;
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_virtual_accounts_updated_at ON public.virtual_accounts;
CREATE TRIGGER update_virtual_accounts_updated_at BEFORE UPDATE ON public.virtual_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- 8. ROW-LEVEL SECURITY POLICIES
-- =====================================================================

DROP POLICY IF EXISTS "Admins delete own notifications" ON public.admin_notifications;
CREATE POLICY "Admins delete own notifications" ON public.admin_notifications AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = admin_id));

DROP POLICY IF EXISTS "Admins read own notifications" ON public.admin_notifications;
CREATE POLICY "Admins read own notifications" ON public.admin_notifications AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = admin_id));

DROP POLICY IF EXISTS "Admins update own notifications" ON public.admin_notifications;
CREATE POLICY "Admins update own notifications" ON public.admin_notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = admin_id));

DROP POLICY IF EXISTS "Admins can read own admin row" ON public.admin_users;
CREATE POLICY "Admins can read own admin row" ON public.admin_users AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = auth.uid()));

DROP POLICY IF EXISTS "Admins view admin_users" ON public.admin_users;
CREATE POLICY "Admins view admin_users" ON public.admin_users AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage admin_users" ON public.admin_users;
CREATE POLICY "Super admins manage admin_users" ON public.admin_users AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update match dispositions" ON public.aml_matches;
CREATE POLICY "Admins update match dispositions" ON public.aml_matches AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_admin_user(auth.uid()) OR is_kyc_reviewer(auth.uid())))
  WITH CHECK ((is_admin_user(auth.uid()) OR is_kyc_reviewer(auth.uid())));

DROP POLICY IF EXISTS "Users read own matches" ON public.aml_matches;
CREATE POLICY "Users read own matches" ON public.aml_matches AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM aml_screenings s
  WHERE ((s.id = aml_matches.screening_id) AND ((s.user_id = auth.uid()) OR is_admin_user(auth.uid()) OR is_kyc_reviewer(auth.uid()))))));

DROP POLICY IF EXISTS "Users read own screenings" ON public.aml_screenings;
CREATE POLICY "Users read own screenings" ON public.aml_screenings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR is_admin_user(auth.uid()) OR is_kyc_reviewer(auth.uid())));

DROP POLICY IF EXISTS "Admins read watchlist" ON public.aml_watchlist;
CREATE POLICY "Admins read watchlist" ON public.aml_watchlist AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin_user(auth.uid()) OR is_kyc_reviewer(auth.uid())));

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Admins can manage bank accounts" ON public.bank_accounts;
CREATE POLICY "Admins can manage bank accounts" ON public.bank_accounts AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance can view bank accounts" ON public.bank_accounts;
CREATE POLICY "Finance can view bank accounts" ON public.bank_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Finance can insert bank transactions" ON public.bank_transactions;
CREATE POLICY "Finance can insert bank transactions" ON public.bank_transactions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Finance can update bank transactions" ON public.bank_transactions;
CREATE POLICY "Finance can update bank transactions" ON public.bank_transactions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Finance can view bank transactions" ON public.bank_transactions;
CREATE POLICY "Finance can view bank transactions" ON public.bank_transactions AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can delete own beneficiaries" ON public.beneficiaries;
CREATE POLICY "Users can delete own beneficiaries" ON public.beneficiaries AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own beneficiaries" ON public.beneficiaries;
CREATE POLICY "Users can insert own beneficiaries" ON public.beneficiaries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own beneficiaries" ON public.beneficiaries;
CREATE POLICY "Users can update own beneficiaries" ON public.beneficiaries AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own beneficiaries" ON public.beneficiaries;
CREATE POLICY "Users can view own beneficiaries" ON public.beneficiaries AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins manage bill payments" ON public.bill_payments;
CREATE POLICY "Admins manage bill payments" ON public.bill_payments AS PERMISSIVE FOR ALL TO public
  USING (is_admin_user(auth.uid()))
  WITH CHECK (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Users view own bill payments" ON public.bill_payments;
CREATE POLICY "Users view own bill payments" ON public.bill_payments AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "biz_member owner write" ON public.business_card_members;
CREATE POLICY "biz_member owner write" ON public.business_card_members AS PERMISSIVE FOR ALL TO public
  USING (is_business_program_owner(program_id, auth.uid()))
  WITH CHECK (is_business_program_owner(program_id, auth.uid()));

DROP POLICY IF EXISTS "biz_member visible" ON public.business_card_members;
CREATE POLICY "biz_member visible" ON public.business_card_members AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR is_business_program_owner(program_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "biz_program owner read" ON public.business_card_programs;
CREATE POLICY "biz_program owner read" ON public.business_card_programs AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = owner_user_id) OR has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM business_card_members m
  WHERE ((m.program_id = business_card_programs.id) AND (m.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "biz_program owner write" ON public.business_card_programs;
CREATE POLICY "biz_program owner write" ON public.business_card_programs AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = owner_user_id))
  WITH CHECK ((auth.uid() = owner_user_id));

DROP POLICY IF EXISTS "card_auth self read" ON public.card_authorizations;
CREATE POLICY "card_auth self read" ON public.card_authorizations AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "card_fraud self read" ON public.card_fraud_signals;
CREATE POLICY "card_fraud self read" ON public.card_fraud_signals AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "card_funding self insert" ON public.card_funding_events;
CREATE POLICY "card_funding self insert" ON public.card_funding_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "card_funding self read" ON public.card_funding_events;
CREATE POLICY "card_funding self read" ON public.card_funding_events AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "card_controls owner read" ON public.card_spending_controls;
CREATE POLICY "card_controls owner read" ON public.card_spending_controls AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM issued_cards c
  WHERE ((c.id = card_spending_controls.card_id) AND ((c.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))))));

DROP POLICY IF EXISTS "card_controls owner write" ON public.card_spending_controls;
CREATE POLICY "card_controls owner write" ON public.card_spending_controls AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM issued_cards c
  WHERE ((c.id = card_spending_controls.card_id) AND (c.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM issued_cards c
  WHERE ((c.id = card_spending_controls.card_id) AND (c.user_id = auth.uid())))));

DROP POLICY IF EXISTS "card_txn self read" ON public.card_transactions;
CREATE POLICY "card_txn self read" ON public.card_transactions AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "cardholders self insert" ON public.cardholders;
CREATE POLICY "cardholders self insert" ON public.cardholders AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "cardholders self read" ON public.cardholders;
CREATE POLICY "cardholders self read" ON public.cardholders AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "cardholders self update" ON public.cardholders;
CREATE POLICY "cardholders self update" ON public.cardholders AS PERMISSIVE FOR UPDATE TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can view all cards" ON public.cards;
CREATE POLICY "Admins can view all cards" ON public.cards AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own cards" ON public.cards;
CREATE POLICY "Users can create own cards" ON public.cards AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete own cards" ON public.cards;
CREATE POLICY "Users can delete own cards" ON public.cards AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own cards" ON public.cards;
CREATE POLICY "Users can update own cards" ON public.cards AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own cards" ON public.cards;
CREATE POLICY "Users can view own cards" ON public.cards AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can view circle webhook events" ON public.circle_webhook_events;
CREATE POLICY "Admins can view circle webhook events" ON public.circle_webhook_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Compliance can manage alerts" ON public.compliance_alerts;
CREATE POLICY "Compliance can manage alerts" ON public.compliance_alerts AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Compliance can view alerts" ON public.compliance_alerts;
CREATE POLICY "Compliance can view alerts" ON public.compliance_alerts AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Compliance can manage reports" ON public.compliance_reports;
CREATE POLICY "Compliance can manage reports" ON public.compliance_reports AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Compliance can view reports" ON public.compliance_reports;
CREATE POLICY "Compliance can view reports" ON public.compliance_reports AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can manage compliance rules" ON public.compliance_rules;
CREATE POLICY "Admins can manage compliance rules" ON public.compliance_rules AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Compliance can view rules" ON public.compliance_rules;
CREATE POLICY "Compliance can view rules" ON public.compliance_rules AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can manage corridors" ON public.cpn_corridors;
CREATE POLICY "Admins can manage corridors" ON public.cpn_corridors AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read corridors" ON public.cpn_corridors;
CREATE POLICY "Authenticated users can read corridors" ON public.cpn_corridors AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Finance can manage CRM activities" ON public.crm_activities;
CREATE POLICY "Finance can manage CRM activities" ON public.crm_activities AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "users view own crossmint wallets" ON public.crossmint_wallets;
CREATE POLICY "users view own crossmint wallets" ON public.crossmint_wallets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users create own cmyc transfers" ON public.crossmint_yellowcard_transfers;
CREATE POLICY "Users create own cmyc transfers" ON public.crossmint_yellowcard_transfers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users view own cmyc transfers" ON public.crossmint_yellowcard_transfers;
CREATE POLICY "Users view own cmyc transfers" ON public.crossmint_yellowcard_transfers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage crypto pairs" ON public.crypto_pairs;
CREATE POLICY "Admins can manage crypto pairs" ON public.crypto_pairs AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Crypto pairs are publicly readable" ON public.crypto_pairs;
CREATE POLICY "Crypto pairs are publicly readable" ON public.crypto_pairs AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Finance can view all crypto trades" ON public.crypto_trades;
CREATE POLICY "Finance can view all crypto trades" ON public.crypto_trades AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can create crypto trades" ON public.crypto_trades;
CREATE POLICY "Users can create crypto trades" ON public.crypto_trades AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own crypto trades" ON public.crypto_trades;
CREATE POLICY "Users can view own crypto trades" ON public.crypto_trades AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage currencies" ON public.currencies;
CREATE POLICY "Admins can manage currencies" ON public.currencies AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Currencies are publicly readable" ON public.currencies;
CREATE POLICY "Currencies are publicly readable" ON public.currencies AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Staff can create communications" ON public.customer_communications;
CREATE POLICY "Staff can create communications" ON public.customer_communications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));

DROP POLICY IF EXISTS "Staff can view communications" ON public.customer_communications;
CREATE POLICY "Staff can view communications" ON public.customer_communications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Customers can upload own documents" ON public.customer_documents;
CREATE POLICY "Customers can upload own documents" ON public.customer_documents AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customer_documents.customer_id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Customers can view own documents" ON public.customer_documents;
CREATE POLICY "Customers can view own documents" ON public.customer_documents AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customer_documents.customer_id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Finance can manage customer documents" ON public.customer_documents;
CREATE POLICY "Finance can manage customer documents" ON public.customer_documents AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Customers can update own onboarding" ON public.customer_onboarding;
CREATE POLICY "Customers can update own onboarding" ON public.customer_onboarding AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customer_onboarding.customer_id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Customers can view own onboarding" ON public.customer_onboarding;
CREATE POLICY "Customers can view own onboarding" ON public.customer_onboarding AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customer_onboarding.customer_id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Finance can manage customer onboarding" ON public.customer_onboarding;
CREATE POLICY "Finance can manage customer onboarding" ON public.customer_onboarding AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Customers can view own portal access" ON public.customer_portal_access;
CREATE POLICY "Customers can view own portal access" ON public.customer_portal_access AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Finance can manage portal access" ON public.customer_portal_access;
CREATE POLICY "Finance can manage portal access" ON public.customer_portal_access AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Customers can update own customer record" ON public.customers;
CREATE POLICY "Customers can update own customer record" ON public.customers AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customers.id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Customers can view own customer record" ON public.customers;
CREATE POLICY "Customers can view own customer record" ON public.customers AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM customer_portal_access cpa
  WHERE ((cpa.customer_id = customers.id) AND (cpa.user_id = auth.uid()) AND (cpa.is_active = true)))));

DROP POLICY IF EXISTS "Finance can manage customers" ON public.customers;
CREATE POLICY "Finance can manage customers" ON public.customers AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Staff can create disputes" ON public.disputes;
CREATE POLICY "Staff can create disputes" ON public.disputes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can update disputes" ON public.disputes;
CREATE POLICY "Staff can update disputes" ON public.disputes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can view all disputes" ON public.disputes;
CREATE POLICY "Staff can view all disputes" ON public.disputes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Authenticated read banks cache" ON public.flw_banks_cache;
CREATE POLICY "Authenticated read banks cache" ON public.flw_banks_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated read billers cache" ON public.flw_billers_cache;
CREATE POLICY "Authenticated read billers cache" ON public.flw_billers_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins view webhook logs" ON public.flw_webhook_logs;
CREATE POLICY "Admins view webhook logs" ON public.flw_webhook_logs AS PERMISSIVE FOR SELECT TO public
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage FX rates" ON public.fx_rates;
CREATE POLICY "Admins can manage FX rates" ON public.fx_rates AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "FX rates are publicly readable" ON public.fx_rates;
CREATE POLICY "FX rates are publicly readable" ON public.fx_rates AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Finance can view all fx transactions" ON public.fx_transactions;
CREATE POLICY "Finance can view all fx transactions" ON public.fx_transactions AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can create fx transactions" ON public.fx_transactions;
CREATE POLICY "Users can create fx transactions" ON public.fx_transactions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own fx transactions" ON public.fx_transactions;
CREATE POLICY "Users can view own fx transactions" ON public.fx_transactions AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Finance and admin can manage ITCs" ON public.input_tax_credits;
CREATE POLICY "Finance and admin can manage ITCs" ON public.input_tax_credits AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Admins can manage integration settings" ON public.integration_settings;
CREATE POLICY "Admins can manage integration settings" ON public.integration_settings AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view integration settings" ON public.integration_settings;
CREATE POLICY "Admins can view integration settings" ON public.integration_settings AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users view own ca transfers" ON public.intra_ca_transfers;
CREATE POLICY "Users view own ca transfers" ON public.intra_ca_transfers AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "issued_cards self insert" ON public.issued_cards;
CREATE POLICY "issued_cards self insert" ON public.issued_cards AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "issued_cards self read" ON public.issued_cards;
CREATE POLICY "issued_cards self read" ON public.issued_cards AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "issued_cards self update" ON public.issued_cards;
CREATE POLICY "issued_cards self update" ON public.issued_cards AS PERMISSIVE FOR UPDATE TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.kyc_audit_log;
CREATE POLICY "Admins can insert audit log" ON public.kyc_audit_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can view audit log" ON public.kyc_audit_log;
CREATE POLICY "Admins can view audit log" ON public.kyc_audit_log AS PERMISSIVE FOR SELECT TO public
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins read audit log" ON public.kyc_audit_log;
CREATE POLICY "Admins read audit log" ON public.kyc_audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins delete kyc" ON public.kyc_verifications;
CREATE POLICY "Admins delete kyc" ON public.kyc_verifications AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "KYC reviewers can update all verifications" ON public.kyc_verifications;
CREATE POLICY "KYC reviewers can update all verifications" ON public.kyc_verifications AS PERMISSIVE FOR UPDATE TO public
  USING (is_kyc_reviewer(auth.uid()));

DROP POLICY IF EXISTS "KYC reviewers can view all verifications" ON public.kyc_verifications;
CREATE POLICY "KYC reviewers can view all verifications" ON public.kyc_verifications AS PERMISSIVE FOR SELECT TO public
  USING (is_kyc_reviewer(auth.uid()));

DROP POLICY IF EXISTS "Users insert own kyc" ON public.kyc_verifications;
CREATE POLICY "Users insert own kyc" ON public.kyc_verifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users update own kyc submission fields" ON public.kyc_verifications;
CREATE POLICY "Users update own kyc submission fields" ON public.kyc_verifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users view own kyc" ON public.kyc_verifications;
CREATE POLICY "Users view own kyc" ON public.kyc_verifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = user_id) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Admins can manage ledger accounts" ON public.ledger_accounts AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Ledger accounts are readable by authenticated" ON public.ledger_accounts;
CREATE POLICY "Ledger accounts are readable by authenticated" ON public.ledger_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff ledger inserts only" ON public.ledger_entries;
CREATE POLICY "Staff ledger inserts only" ON public.ledger_entries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.ledger_entries;
CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries AS PERMISSIVE FOR SELECT TO public
  USING (((wallet_id IN ( SELECT wallets.id
   FROM wallets
  WHERE (wallets.user_id = auth.uid()))) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can view all funding sources" ON public.linked_funding_sources;
CREATE POLICY "Admins can view all funding sources" ON public.linked_funding_sources AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own funding sources" ON public.linked_funding_sources;
CREATE POLICY "Users can create own funding sources" ON public.linked_funding_sources AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete own funding sources" ON public.linked_funding_sources;
CREATE POLICY "Users can delete own funding sources" ON public.linked_funding_sources AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own funding sources" ON public.linked_funding_sources;
CREATE POLICY "Users can update own funding sources" ON public.linked_funding_sources AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own funding sources" ON public.linked_funding_sources;
CREATE POLICY "Users can view own funding sources" ON public.linked_funding_sources AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authorized staff can update maker checker requests" ON public.maker_checker_requests;
CREATE POLICY "Authorized staff can update maker checker requests" ON public.maker_checker_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can create maker checker requests" ON public.maker_checker_requests;
CREATE POLICY "Staff can create maker checker requests" ON public.maker_checker_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'support'::app_role)));

DROP POLICY IF EXISTS "Staff can view maker checker requests" ON public.maker_checker_requests;
CREATE POLICY "Staff can view maker checker requests" ON public.maker_checker_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR (maker_id = auth.uid())));

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage onboarding steps" ON public.onboarding_steps;
CREATE POLICY "Admins can manage onboarding steps" ON public.onboarding_steps AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Onboarding steps are readable by authenticated" ON public.onboarding_steps;
CREATE POLICY "Onboarding steps are readable by authenticated" ON public.onboarding_steps AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Staff can view KPIs" ON public.operations_kpis;
CREATE POLICY "Staff can view KPIs" ON public.operations_kpis AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "System can insert KPIs" ON public.operations_kpis;
CREATE POLICY "System can insert KPIs" ON public.operations_kpis AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view paysafe webhook logs" ON public.paysafe_webhook_logs;
CREATE POLICY "Admins can view paysafe webhook logs" ON public.paysafe_webhook_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read persona webhook logs" ON public.persona_webhook_logs;
CREATE POLICY "Admins read persona webhook logs" ON public.persona_webhook_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Users view own plaid accounts" ON public.plaid_accounts;
CREATE POLICY "Users view own plaid accounts" ON public.plaid_accounts AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users delete own plaid items" ON public.plaid_items;
CREATE POLICY "Users delete own plaid items" ON public.plaid_items AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users view own plaid items" ON public.plaid_items;
CREATE POLICY "Users view own plaid items" ON public.plaid_items AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage pricing config" ON public.pricing_config;
CREATE POLICY "Admins can manage pricing config" ON public.pricing_config AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Pricing config is publicly readable" ON public.pricing_config;
CREATE POLICY "Pricing config is publicly readable" ON public.pricing_config AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles AS PERMISSIVE FOR DELETE TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Finance can manage purchase bill items" ON public.purchase_bill_items;
CREATE POLICY "Finance can manage purchase bill items" ON public.purchase_bill_items AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM purchase_bills pb
  WHERE ((pb.id = purchase_bill_items.bill_id) AND (has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Finance can manage purchase bills" ON public.purchase_bills;
CREATE POLICY "Finance can manage purchase bills" ON public.purchase_bills AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Service role only" ON public.rate_limits;
CREATE POLICY "Service role only" ON public.rate_limits AS PERMISSIVE FOR ALL TO public
  USING (false);

DROP POLICY IF EXISTS "Finance can manage reconciliation" ON public.reconciliation_records;
CREATE POLICY "Finance can manage reconciliation" ON public.reconciliation_records AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Finance can view reconciliation" ON public.reconciliation_records;
CREATE POLICY "Finance can view reconciliation" ON public.reconciliation_records AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Compliance can manage regulatory reports" ON public.regulatory_reports;
CREATE POLICY "Compliance can manage regulatory reports" ON public.regulatory_reports AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Compliance can view regulatory reports" ON public.regulatory_reports;
CREATE POLICY "Compliance can view regulatory reports" ON public.regulatory_reports AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Finance can manage sales invoice items" ON public.sales_invoice_items;
CREATE POLICY "Finance can manage sales invoice items" ON public.sales_invoice_items AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM sales_invoices si
  WHERE ((si.id = sales_invoice_items.invoice_id) AND (has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Finance can manage sales invoices" ON public.sales_invoices;
CREATE POLICY "Finance can manage sales invoices" ON public.sales_invoices AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users delete own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users delete own saved cards" ON public.saved_payment_methods AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users insert own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users insert own saved cards" ON public.saved_payment_methods AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users update own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users update own saved cards" ON public.saved_payment_methods AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users view own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users view own saved cards" ON public.saved_payment_methods AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can view all savings goals" ON public.savings_goals;
CREATE POLICY "Admins can view all savings goals" ON public.savings_goals AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own savings goals" ON public.savings_goals;
CREATE POLICY "Users can create own savings goals" ON public.savings_goals AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete own savings goals" ON public.savings_goals;
CREATE POLICY "Users can delete own savings goals" ON public.savings_goals AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own savings goals" ON public.savings_goals;
CREATE POLICY "Users can update own savings goals" ON public.savings_goals AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own savings goals" ON public.savings_goals;
CREATE POLICY "Users can view own savings goals" ON public.savings_goals AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Owners insert own short links" ON public.short_links;
CREATE POLICY "Owners insert own short links" ON public.short_links AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners revoke own short links" ON public.short_links;
CREATE POLICY "Owners revoke own short links" ON public.short_links AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid()))
  WITH CHECK ((owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners view own short links" ON public.short_links;
CREATE POLICY "Owners view own short links" ON public.short_links AS PERMISSIVE FOR SELECT TO authenticated
  USING ((owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own connected account" ON public.stripe_connected_accounts;
CREATE POLICY "Users can insert own connected account" ON public.stripe_connected_accounts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own connected account" ON public.stripe_connected_accounts;
CREATE POLICY "Users can update own connected account" ON public.stripe_connected_accounts AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can view own connected account" ON public.stripe_connected_accounts;
CREATE POLICY "Users can view own connected account" ON public.stripe_connected_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users view their own payin sessions" ON public.stripe_payin_sessions;
CREATE POLICY "Users view their own payin sessions" ON public.stripe_payin_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users create own stripe payout recipients" ON public.stripe_payout_recipients;
CREATE POLICY "Users create own stripe payout recipients" ON public.stripe_payout_recipients AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users delete own stripe payout recipients" ON public.stripe_payout_recipients;
CREATE POLICY "Users delete own stripe payout recipients" ON public.stripe_payout_recipients AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users update own stripe payout recipients" ON public.stripe_payout_recipients;
CREATE POLICY "Users update own stripe payout recipients" ON public.stripe_payout_recipients AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users view own stripe payout recipients" ON public.stripe_payout_recipients;
CREATE POLICY "Users view own stripe payout recipients" ON public.stripe_payout_recipients AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins manage sumsub verifications" ON public.sumsub_verifications;
CREATE POLICY "Admins manage sumsub verifications" ON public.sumsub_verifications AS PERMISSIVE FOR ALL TO authenticated
  USING (is_kyc_reviewer(auth.uid()))
  WITH CHECK (is_kyc_reviewer(auth.uid()));

DROP POLICY IF EXISTS "Admins read sumsub webhook logs" ON public.sumsub_webhook_logs;
CREATE POLICY "Admins read sumsub webhook logs" ON public.sumsub_webhook_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Finance and admin can manage tax filings" ON public.tax_filings;
CREATE POLICY "Finance and admin can manage tax filings" ON public.tax_filings AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Finance and admin can manage tax rates" ON public.tax_rates;
CREATE POLICY "Finance and admin can manage tax rates" ON public.tax_rates AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Finance and admin can manage tax registrations" ON public.tax_registrations;
CREATE POLICY "Finance and admin can manage tax registrations" ON public.tax_registrations AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Finance and admin can manage tax transactions" ON public.tax_transactions;
CREATE POLICY "Finance and admin can manage tax transactions" ON public.tax_transactions AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Finance and admin can manage taxable services" ON public.taxable_services;
CREATE POLICY "Finance and admin can manage taxable services" ON public.taxable_services AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Admins manage tier limits" ON public.tier_limits;
CREATE POLICY "Admins manage tier limits" ON public.tier_limits AS PERMISSIVE FOR ALL TO authenticated
  USING ((is_admin_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((is_admin_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Anyone can read tier limits" ON public.tier_limits;
CREATE POLICY "Anyone can read tier limits" ON public.tier_limits AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff can create transaction interventions" ON public.transaction_interventions;
CREATE POLICY "Staff can create transaction interventions" ON public.transaction_interventions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can update transaction interventions" ON public.transaction_interventions;
CREATE POLICY "Staff can update transaction interventions" ON public.transaction_interventions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can view transaction interventions" ON public.transaction_interventions;
CREATE POLICY "Staff can view transaction interventions" ON public.transaction_interventions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Transaction rules manageable by finance" ON public.transaction_rules;
CREATE POLICY "Transaction rules manageable by finance" ON public.transaction_rules AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Transaction rules readable by staff" ON public.transaction_rules;
CREATE POLICY "Transaction rules readable by staff" ON public.transaction_rules AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Admins can view all transfers" ON public.transfers;
CREATE POLICY "Admins can view all transfers" ON public.transfers AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Users can create transfers" ON public.transfers;
CREATE POLICY "Users can create transfers" ON public.transfers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = sender_id));

DROP POLICY IF EXISTS "Users can view own transfers" ON public.transfers;
CREATE POLICY "Users can view own transfers" ON public.transfers AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = sender_id));

DROP POLICY IF EXISTS "users view own treasury fa" ON public.treasury_financial_accounts;
CREATE POLICY "users view own treasury fa" ON public.treasury_financial_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "users view own treasury received" ON public.treasury_received_entries;
CREATE POLICY "users view own treasury received" ON public.treasury_received_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "users view own treasury transfers" ON public.treasury_transfers;
CREATE POLICY "users view own treasury transfers" ON public.treasury_transfers AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "admin view treasury webhook events" ON public.treasury_webhook_events;
CREATE POLICY "admin view treasury webhook events" ON public.treasury_webhook_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage risk tiers insert" ON public.user_risk_tiers;
CREATE POLICY "Admins manage risk tiers insert" ON public.user_risk_tiers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_admin_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Admins manage risk tiers update" ON public.user_risk_tiers;
CREATE POLICY "Admins manage risk tiers update" ON public.user_risk_tiers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_admin_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)))
  WITH CHECK ((is_admin_user(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Users view own risk tier" ON public.user_risk_tiers;
CREATE POLICY "Users view own risk tier" ON public.user_risk_tiers AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = user_id) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users view own roles, admins view all" ON public.user_roles;
CREATE POLICY "Users view own roles, admins view all" ON public.user_roles AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Finance can manage vendors" ON public.vendors;
CREATE POLICY "Finance can manage vendors" ON public.vendors AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins manage virtual accounts" ON public.virtual_accounts;
CREATE POLICY "Admins manage virtual accounts" ON public.virtual_accounts AS PERMISSIVE FOR ALL TO public
  USING (is_admin_user(auth.uid()))
  WITH CHECK (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Users view own virtual accounts" ON public.virtual_accounts;
CREATE POLICY "Users view own virtual accounts" ON public.virtual_accounts AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = user_id) OR is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Staff can create wallet operations" ON public.wallet_operations;
CREATE POLICY "Staff can create wallet operations" ON public.wallet_operations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role)));

DROP POLICY IF EXISTS "Staff can view wallet operations" ON public.wallet_operations;
CREATE POLICY "Staff can view wallet operations" ON public.wallet_operations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

DROP POLICY IF EXISTS "Admins can view all wallets" ON public.wallets;
CREATE POLICY "Admins can view all wallets" ON public.wallets AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own wallets" ON public.wallets;
CREATE POLICY "Users can create own wallets" ON public.wallets AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own wallets" ON public.wallets;
CREATE POLICY "Users can update own wallets" ON public.wallets AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own wallets" ON public.wallets;
CREATE POLICY "Users can view own wallets" ON public.wallets AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins view webhook events" ON public.webhook_events;
CREATE POLICY "Admins view webhook events" ON public.webhook_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff can view webhook inbox" ON public.webhooks_inbox;
CREATE POLICY "Staff can view webhook inbox" ON public.webhooks_inbox AS PERMISSIVE FOR SELECT TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'compliance'::app_role) OR has_role(auth.uid(), 'support'::app_role)));

-- END OF SCHEMA
