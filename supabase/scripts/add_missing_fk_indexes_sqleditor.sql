-- =====================================================================
-- Missing FK indexes — SQL EDITOR / TRANSACTION-SAFE version
-- =====================================================================
-- Same 66 indexes as add_missing_fk_indexes.sql, but WITHOUT CONCURRENTLY
-- so it runs in the Supabase SQL editor (which wraps queries in a
-- transaction). Trade-off: each CREATE INDEX briefly locks WRITES to that
-- one table while it builds (reads are unaffected).
--
-- SAFETY GUARD: lock_timeout = 3s. If a table is busy and the index can't
-- grab its lock within 3s, that ONE statement errors out instead of
-- blocking live transfers/ledger writes. IF NOT EXISTS means you can just
-- re-run this whole script later to pick up any that were skipped.
--
-- Best run during a low-traffic window. Zero effect on query results.
-- (For zero write-locking at any scale, use the CONCURRENTLY version via
--  psql instead — see add_missing_fk_indexes.sql.)
-- =====================================================================

SET lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS idx_aml_matches_watchlist_id ON public.aml_matches (watchlist_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_ledger_account_id ON public.bank_accounts (ledger_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank_account_id ON public.bank_transactions (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_credit_account_id ON public.bank_transactions (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_debit_account_id ON public.bank_transactions (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_rule_id ON public.bank_transactions (rule_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_wallet_id ON public.bill_payments (wallet_id);
CREATE INDEX IF NOT EXISTS idx_business_card_programs_funding_wallet_id ON public.business_card_programs (funding_wallet_id);
CREATE INDEX IF NOT EXISTS idx_card_fraud_signals_authorization_id ON public.card_fraud_signals (authorization_id);
CREATE INDEX IF NOT EXISTS idx_card_fraud_signals_user_id ON public.card_fraud_signals (user_id);
CREATE INDEX IF NOT EXISTS idx_card_funding_events_source_wallet_id ON public.card_funding_events (source_wallet_id);
CREATE INDEX IF NOT EXISTS idx_card_funding_events_user_id ON public.card_funding_events (user_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_authorization_id ON public.card_transactions (authorization_id);
CREATE INDEX IF NOT EXISTS idx_cards_wallet_id ON public.cards (wallet_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_assigned_to ON public.compliance_alerts (assigned_to);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_resolved_by ON public.compliance_alerts (resolved_by);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_rule_id ON public.compliance_alerts (rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_transfer_id ON public.compliance_alerts (transfer_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_user_id ON public.compliance_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_filed_by ON public.compliance_reports (filed_by);
CREATE INDEX IF NOT EXISTS idx_crm_activities_assigned_to ON public.crm_activities (assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_activities_created_by ON public.crm_activities (created_by);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer_id ON public.crm_activities (customer_id);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_base_wallet_id ON public.crypto_trades (base_wallet_id);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_pair_id ON public.crypto_trades (pair_id);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_quote_wallet_id ON public.crypto_trades (quote_wallet_id);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_user_id ON public.crypto_trades (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON public.customer_documents (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_onboarding_id ON public.customer_documents (onboarding_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_reviewed_by ON public.customer_documents (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_customer_onboarding_reviewed_by ON public.customer_onboarding (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_customer_onboarding_step_id ON public.customer_onboarding (step_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_user_id ON public.customer_portal_access (user_id);
CREATE INDEX IF NOT EXISTS idx_customers_kyc_verified_by ON public.customers (kyc_verified_by);
CREATE INDEX IF NOT EXISTS idx_fx_transactions_from_wallet_id ON public.fx_transactions (from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_fx_transactions_to_wallet_id ON public.fx_transactions (to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_fx_transactions_user_id ON public.fx_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_input_tax_credits_vendor_id ON public.input_tax_credits (vendor_id);
CREATE INDEX IF NOT EXISTS idx_intra_ca_transfers_destination_wallet_id ON public.intra_ca_transfers (destination_wallet_id);
CREATE INDEX IF NOT EXISTS idx_intra_ca_transfers_plaid_account_id ON public.intra_ca_transfers (plaid_account_id);
CREATE INDEX IF NOT EXISTS idx_issued_cards_cardholder_id ON public.issued_cards (cardholder_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_log_admin_id ON public.kyc_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_log_kyc_verification_id ON public.kyc_audit_log (kyc_verification_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_reviewed_by ON public.kyc_verifications (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_parent_id ON public.ledger_accounts (parent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON public.ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_by ON public.ledger_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id ON public.ledger_entries (wallet_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_account_id ON public.purchase_bill_items (account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill_id ON public.purchase_bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor_id ON public.purchase_bills (vendor_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_records_bank_transaction_id ON public.reconciliation_records (bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_records_ledger_entry_id ON public.reconciliation_records (ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_records_resolved_by ON public.reconciliation_records (resolved_by);
CREATE INDEX IF NOT EXISTS idx_reconciliation_records_transfer_id ON public.reconciliation_records (transfer_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_reports_subject_customer_id ON public.regulatory_reports (subject_customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_account_id ON public.sales_invoice_items (account_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice_id ON public.sales_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_id ON public.sales_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_sumsub_verifications_requested_by_admin_id ON public.sumsub_verifications (requested_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_tax_transactions_customer_id ON public.tax_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_credit_account_id ON public.transaction_rules (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_debit_account_id ON public.transaction_rules (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_id ON public.transfers (sender_id);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_wallet_id ON public.transfers (sender_wallet_id);
