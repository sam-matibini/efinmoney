-- Sweep fix for "permission denied for table ... (42501)" across the compliance
-- module tables. Same root cause as settlement_reconciliations: the tables were
-- created with RLS enabled and policies, but the coarse table-level GRANTs for
-- the `authenticated` role were never issued, so any INSERT/UPDATE/DELETE from an
-- admin page (File / Log / Save) is denied at the privilege layer before RLS runs.
--
-- Safety: we ONLY grant on tables where row-level security is enabled, so a
-- missing/loose policy cannot turn a grant into open access. Tables without RLS
-- are skipped and reported via a NOTICE. Idempotent — safe to re-run.

DO $$
DECLARE
  t text;
  compliance_tables text[] := ARRAY[
    -- AML / KYC program
    'aml_policies', 'cdd_questionnaires', 'edd_cases', 'edd_questionnaires', 'edd_documents',
    'sanctions_screening_rules', 'beneficial_owners', 'beneficial_owner_history',
    -- Reporting & monitoring
    'str_reports', 'tx_monitoring_alerts', 'trade_aml_rules', 'trade_aml_alerts',
    'lctr_reports', 'eftr_reports', 'wire_transfer_records', 'travel_rule_records',
    -- Risk & correspondents
    'correspondent_banks', 'geographic_risk_ratings', 'operational_risks',
    -- Change management & obligations
    'regulatory_changes', 'compliance_obligations',
    -- Finance controls (module 18 / 23 / 26)
    'settlement_reconciliations', 'period_locks', 'period_close_checklists', 'evidence_records',
    -- Training, audit, cases, incidents, fraud
    'training_courses', 'training_records', 'auditor_access', 'audit_sessions',
    'case_escalations', 'case_evidence', 'case_notes',
    'incidents', 'incident_timeline', 'security_incidents',
    'fraud_rules', 'fraud_signals',
    -- Safeguarding / board / unclaimed
    'safeguarding_snapshots', 'board_reports', 'unclaimed_funds'
  ];
BEGIN
  FOREACH t IN ARRAY compliance_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'skip % — table does not exist', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity = true
    ) THEN
      RAISE NOTICE 'skip % — RLS not enabled (not granting to avoid open write access)', t;
      CONTINUE;
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
