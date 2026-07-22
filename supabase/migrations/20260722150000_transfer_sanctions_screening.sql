-- Sanctions screening on transfers.
--
-- tg_transfers_aml_screen has been calling invoke_aml_screen, which posts to
-- hgmskcvaeadnyovbroup.supabase.co (not this project) for an 'aml-screen' edge
-- function that does not exist. The failure is swallowed by that function's
-- own EXCEPTION handler, so every transfer this platform has processed has
-- gone unscreened, silently.
--
-- Two changes here:
--   1. Screening runs in-database against aml_watchlist, reusing aml_match_name
--      from the KYB work. No network hop, nothing to deploy, nothing to go
--      stale.
--   2. The RECIPIENT is screened, not just the sender. invoke_aml_screen only
--      ever took sender_id -- but on an outbound payment the recipient is the
--      party sanctions screening exists to catch.
--
-- SCOPE: this screens and alerts. It does NOT block the transfer. Blocking
-- needs a held status on transfer_status and cooperation from every payout
-- function, and a BEFORE INSERT raise would roll back the very evidence that
-- screening happened. That is a separate piece of work.

-- ============== alert rule ==============
-- compliance_alerts.rule_id is NOT NULL, so sanctions alerts need a rule row.
INSERT INTO public.compliance_rules
  (rule_code, rule_name, description, rule_type, parameters, severity, is_active)
VALUES
  ('SANCTIONS_MATCH',
   'Sanctions / watchlist match',
   'A transfer party matched an entry on a sanctions, PEP or watchlist source.',
   'sanctions',
   '{}'::jsonb,
   'critical',
   true)
ON CONFLICT (rule_code) DO NOTHING;

-- ============== screen one transfer ==============
-- Returns the number of parties that hit.
CREATE OR REPLACE FUNCTION public.screen_transfer_parties(p_transfer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx          RECORD;
  v_sender_name text;
  v_matches     integer;
  v_hits        integer := 0;
  v_rule_id     uuid;
  v_alert_data  jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_tx FROM public.transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Re-screening supersedes any previous run for this transfer.
  DELETE FROM public.aml_screenings
   WHERE trigger = 'transfer' AND trigger_ref = p_transfer_id;

  -- --- sender ---
  SELECT full_name INTO v_sender_name
    FROM public.profiles WHERE user_id = v_tx.sender_id;

  IF v_sender_name IS NOT NULL AND public.aml_normalize_name(v_sender_name) <> '' THEN
    SELECT count(*) INTO v_matches
      FROM public.aml_match_name(v_sender_name, 'individual');

    INSERT INTO public.aml_screenings
      (user_id, trigger, trigger_ref, subject_name, status, match_count)
    VALUES
      (v_tx.sender_id, 'transfer', p_transfer_id, v_sender_name,
       CASE WHEN v_matches > 0 THEN 'hit' ELSE 'clear' END::aml_screening_status,
       v_matches);

    IF v_matches > 0 THEN
      v_hits := v_hits + 1;
      v_alert_data := v_alert_data || jsonb_build_object(
        'party', 'sender', 'name', v_sender_name, 'matches', v_matches);
    END IF;
  END IF;

  -- --- recipient ---
  -- The payee is screened as an individual and as an entity: recipient_name
  -- carries both people and company names depending on the payout method.
  IF v_tx.recipient_name IS NOT NULL
     AND public.aml_normalize_name(v_tx.recipient_name) <> '' THEN
    SELECT count(*) INTO v_matches
      FROM (
        SELECT watchlist_id FROM public.aml_match_name(v_tx.recipient_name, 'individual')
        UNION
        SELECT watchlist_id FROM public.aml_match_name(v_tx.recipient_name, 'entity')
      ) m;

    INSERT INTO public.aml_screenings
      (user_id, trigger, trigger_ref, subject_name, subject_country, status, match_count)
    VALUES
      (v_tx.sender_id, 'transfer', p_transfer_id, v_tx.recipient_name,
       v_tx.recipient_country,
       CASE WHEN v_matches > 0 THEN 'hit' ELSE 'clear' END::aml_screening_status,
       v_matches);

    IF v_matches > 0 THEN
      v_hits := v_hits + 1;
      v_alert_data := v_alert_data || jsonb_build_object(
        'party', 'recipient', 'name', v_tx.recipient_name, 'matches', v_matches);
    END IF;
  END IF;

  -- --- alert + profile status ---
  IF v_hits > 0 THEN
    SELECT id INTO v_rule_id
      FROM public.compliance_rules WHERE rule_code = 'SANCTIONS_MATCH';

    IF v_rule_id IS NOT NULL THEN
      INSERT INTO public.compliance_alerts
        (user_id, rule_id, transfer_id, severity, status, alert_data, notes)
      VALUES
        (v_tx.sender_id, v_rule_id, p_transfer_id, 'critical', 'open',
         jsonb_build_object(
           'parties', v_alert_data,
           'source_amount', v_tx.source_amount,
           'source_currency', v_tx.source_currency,
           'recipient_country', v_tx.recipient_country),
         'Automatic sanctions screening matched ' || v_hits || ' party(ies). '
         || 'Transfer was NOT blocked -- review and intervene manually.');
    END IF;

    UPDATE public.profiles
       SET aml_status = 'hit', aml_last_screened_at = now()
     WHERE user_id = v_tx.sender_id;
  ELSE
    -- Never downgrade an existing hit on the strength of one clear transfer;
    -- that is a compliance officer's decision, not an automatic one.
    UPDATE public.profiles
       SET aml_status = CASE WHEN aml_status = 'hit' THEN aml_status
                             ELSE 'clear'::aml_profile_status END,
           aml_last_screened_at = now()
     WHERE user_id = v_tx.sender_id;
  END IF;

  RETURN v_hits;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.screen_transfer_parties(uuid) TO authenticated;

-- ============== rewire the trigger ==============
-- Screening must never take a payment down with it: a failure here is logged
-- and swallowed, exactly as the old HTTP call behaved, but the screening
-- itself now actually happens.
CREATE OR REPLACE FUNCTION public.tg_transfers_aml_screen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.screen_transfer_parties(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_transfers_aml_screen failed for transfer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- ============== retire the dead HTTP hop ==============
-- Kept as a loud no-op rather than dropped, so anything still calling it says
-- so in the logs instead of silently doing nothing (which is what it did for
-- the entire life of the platform until now).
CREATE OR REPLACE FUNCTION public.invoke_aml_screen(p_user_id uuid, p_trigger text, p_trigger_ref uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE WARNING
    'invoke_aml_screen is retired (it posted to a stale project ref for an edge function that never existed). Use screen_transfer_parties(transfer_id) or screen_kyb_entity(business_profile_id). Called with user=%, trigger=%, ref=%',
    p_user_id, p_trigger, p_trigger_ref;
END;
$function$;
