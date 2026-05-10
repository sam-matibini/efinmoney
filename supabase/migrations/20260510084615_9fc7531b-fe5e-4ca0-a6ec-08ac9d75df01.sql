
-- Make required user-link columns nullable on financial/audit tables (so SET NULL on delete works)
ALTER TABLE public.transfers ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.fx_transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.crypto_trades ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.compliance_alerts ALTER COLUMN user_id DROP NOT NULL;

-- Drop and recreate FKs to auth.users with ON DELETE SET NULL
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_created_by_fkey;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_sender_id_fkey;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fx_transactions DROP CONSTRAINT IF EXISTS fx_transactions_user_id_fkey;
ALTER TABLE public.fx_transactions ADD CONSTRAINT fx_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.crypto_trades DROP CONSTRAINT IF EXISTS crypto_trades_user_id_fkey;
ALTER TABLE public.crypto_trades ADD CONSTRAINT crypto_trades_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_resolved_by_fkey;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_user_id_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_assigned_to_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_alerts DROP CONSTRAINT IF EXISTS compliance_alerts_resolved_by_fkey;
ALTER TABLE public.compliance_alerts ADD CONSTRAINT compliance_alerts_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_reports DROP CONSTRAINT IF EXISTS compliance_reports_filed_by_fkey;
ALTER TABLE public.compliance_reports ADD CONSTRAINT compliance_reports_filed_by_fkey
  FOREIGN KEY (filed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_assigned_to_fkey;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_created_by_fkey;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.customer_onboarding DROP CONSTRAINT IF EXISTS customer_onboarding_reviewed_by_fkey;
ALTER TABLE public.customer_onboarding ADD CONSTRAINT customer_onboarding_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS customer_documents_reviewed_by_fkey;
ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.customer_portal_access DROP CONSTRAINT IF EXISTS customer_portal_access_user_id_fkey;
ALTER TABLE public.customer_portal_access ADD CONSTRAINT customer_portal_access_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_kyc_verified_by_fkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_kyc_verified_by_fkey
  FOREIGN KEY (kyc_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
