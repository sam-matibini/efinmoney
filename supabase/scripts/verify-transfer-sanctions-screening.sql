-- Verifies that transfer sanctions screening actually fires:
--   (a) a transfer screens BOTH the sender and the recipient;
--   (b) a watchlist match produces a 'hit' screening row;
--   (c) a hit raises a critical compliance_alert linked to the transfer;
--   (d) the sender's profiles.aml_status is set to 'hit';
--   (e) a clean transfer screens clear and raises no alert.
--
-- Run in Supabase Dashboard -> SQL Editor, AFTER migration 20260722150000.
--
-- Same containment as verify-kyb-rls-and-trigger.sql: the fixtures need rows in
-- auth.users (which fires handle_new_user, provisioning profiles, wallets,
-- roles, risk tiers and a welcome email through pg_net), plus a synthetic
-- aml_watchlist entry that must never reach a real screening run. Everything
-- therefore runs inside a block with an EXCEPTION handler, making it a
-- subtransaction that the sentinel at the end unwinds. A genuine failure still
-- propagates and aborts with a readable message.
--
-- Success is reported via RAISE NOTICE. The Dashboard SQL Editor does not show
-- notices, but that does not matter: any failed assertion re-raises as a
-- visible error, so a clean "Success. No rows returned" means every check
-- passed.

DO $outer$
DECLARE
  v_user       uuid := gen_random_uuid();
  v_wallet     uuid;
  v_tx_hit     uuid;
  v_tx_clean   uuid;
  v_watch      uuid;
  v_count      integer;
  v_status     text;
  v_hits       integer;
BEGIN
 BEGIN   -- subtransaction: everything below is unwound before this script ends

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'aml-verify@example.invalid', '', now(), now(), now());

  -- handle_new_user provisions the profile and wallets; name the sender something
  -- we control so we can plant a matching watchlist entry.
  UPDATE public.profiles
     SET full_name = 'Verify Sanctioned Sender'
   WHERE user_id = v_user;

  SELECT id INTO v_wallet FROM public.wallets
   WHERE user_id = v_user AND currency_code = 'CAD' LIMIT 1;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'FIXTURE FAILED: handle_new_user did not provision a CAD wallet';
  END IF;

  -- Synthetic watchlist entry for a payee we will send to.
  INSERT INTO public.aml_watchlist
    (source, source_id, entity_type, name, name_normalized, programs)
  VALUES
    ('ofac', 'VERIFY-TEST-0001', 'individual', 'Verify Blocked Payee',
     public.aml_normalize_name('Verify Blocked Payee'), ARRAY['VERIFY-TEST'])
  RETURNING id INTO v_watch;

  -- ---------- (a)(b)(c)(d) a transfer to a listed payee ----------
  -- funding_source is deliberately not 'wallet' so check_transfer_balance
  -- short-circuits and the fixture needs no ledger entries.
  INSERT INTO public.transfers
    (sender_id, sender_wallet_id, recipient_name, recipient_country, transfer_type,
     source_currency, target_currency, source_amount, target_amount, funding_source)
  VALUES
    (v_user, v_wallet, 'Verify Blocked Payee', 'NG', 'bank',
     'CAD', 'NGN', 10, 10000, 'card')
  RETURNING id INTO v_tx_hit;

  SELECT count(*) INTO v_count
    FROM public.aml_screenings
   WHERE trigger = 'transfer' AND trigger_ref = v_tx_hit;
  IF v_count < 2 THEN
    RAISE EXCEPTION
      'SCREENING FAILED: expected 2 screening rows (sender + recipient), found %', v_count;
  END IF;
  RAISE NOTICE 'OK  (a) transfer screened % parties', v_count;

  SELECT count(*) INTO v_count
    FROM public.aml_screenings
   WHERE trigger = 'transfer' AND trigger_ref = v_tx_hit
     AND subject_name = 'Verify Blocked Payee' AND status = 'hit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'SCREENING FAILED: listed recipient did not produce a hit row';
  END IF;
  RAISE NOTICE 'OK  (b) listed recipient produced a hit';

  SELECT count(*) INTO v_count
    FROM public.compliance_alerts a
    JOIN public.compliance_rules r ON r.id = a.rule_id
   WHERE a.transfer_id = v_tx_hit
     AND r.rule_code = 'SANCTIONS_MATCH'
     AND a.severity = 'critical'
     AND a.status = 'open';
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'ALERT FAILED: expected 1 open critical SANCTIONS_MATCH alert, found %', v_count;
  END IF;
  RAISE NOTICE 'OK  (c) critical compliance alert raised against the transfer';

  SELECT aml_status::text INTO v_status FROM public.profiles WHERE user_id = v_user;
  IF v_status <> 'hit' THEN
    RAISE EXCEPTION 'PROFILE FAILED: expected aml_status=hit, got %', v_status;
  END IF;
  RAISE NOTICE 'OK  (d) sender profile marked as a hit';

  -- ---------- (e) a clean transfer ----------
  INSERT INTO public.transfers
    (sender_id, sender_wallet_id, recipient_name, recipient_country, transfer_type,
     source_currency, target_currency, source_amount, target_amount, funding_source)
  VALUES
    (v_user, v_wallet, 'Verify Ordinary Payee', 'NG', 'bank',
     'CAD', 'NGN', 10, 10000, 'card')
  RETURNING id INTO v_tx_clean;

  SELECT count(*) INTO v_hits
    FROM public.aml_screenings
   WHERE trigger = 'transfer' AND trigger_ref = v_tx_clean AND status = 'hit';
  -- The sender is still listed only if their own name matched; it did not, so
  -- an unlisted payee must leave this transfer with no hits at all.
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'SCREENING FAILED: clean transfer produced % hit(s)', v_hits;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.compliance_alerts WHERE transfer_id = v_tx_clean;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ALERT FAILED: clean transfer raised % alert(s)', v_count;
  END IF;
  RAISE NOTICE 'OK  (e) unlisted payee screens clear and raises no alert';

  RAISE EXCEPTION 'AML_VERIFY_ROLLBACK';

 EXCEPTION
   WHEN OTHERS THEN
     IF SQLERRM = 'AML_VERIFY_ROLLBACK' THEN
       RAISE NOTICE 'Transfer sanctions screening verified; all fixtures rolled back.';
     ELSE
       RAISE;
     END IF;
 END;
END $outer$;
