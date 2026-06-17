
-- 1. AML: remove user self-read
DROP POLICY IF EXISTS "Users read own matches" ON public.aml_matches;
DROP POLICY IF EXISTS "Users read own screenings" ON public.aml_screenings;

-- Helper: revoke table SELECT then grant SELECT on all columns except sensitive ones
DO $$
DECLARE
  t text;
  sensitive text[];
  cols text;
BEGIN
  FOR t, sensitive IN
    SELECT * FROM (VALUES
      ('plaid_items',                      ARRAY['access_token']),
      ('transfers',                        ARRAY['interac_security_answer','interac_security_question']),
      ('kyc_verifications',                ARRAY['persona_session_token','persona_verification_data','interac_claims','internal_notes']),
      ('crossmint_yellowcard_transfers',   ARRAY['crossmint_raw','yellowcard_raw','recipient_account_number','recipient_phone','recipient_email','recipient_bank_code'])
    ) AS v(t, sensitive)
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', t);
    SELECT string_agg(quote_ident(column_name), ', ')
      INTO cols
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND NOT (column_name = ANY(sensitive));
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
