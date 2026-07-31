-- Security Monitoring: feed the "Suspicious Access" card.
--
-- The security_events_view already counts audit_logs WHERE
-- action = 'SUSPICIOUS_ACCESS', but nothing was writing that action.
-- This migration adds a single trigger function used in two places:
--   1. fraud_signals INSERT — high/critical signals (account_takeover,
--      device_anomaly, geo_anomaly, synthetic_identity) write a
--      SUSPICIOUS_ACCESS audit row.
--   2. security_incidents INSERT — every new open incident is mirrored
--      to a SUSPICIOUS_ACCESS audit row so the card has a running total.

CREATE OR REPLACE FUNCTION public.log_suspicious_access_from_fraud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.severity IN ('high', 'critical') AND NEW.signal_type IN (
    'account_takeover', 'device_anomaly', 'geo_anomaly', 'synthetic_identity'
  ) THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (
      NEW.user_id,
      'SUSPICIOUS_ACCESS',
      'fraud_signals',
      NEW.id,
      jsonb_build_object(
        'signal_type', NEW.signal_type,
        'severity', NEW.severity,
        'score', NEW.score,
        'details', NEW.details
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_suspicious_access_from_fraud ON public.fraud_signals;
CREATE TRIGGER trg_log_suspicious_access_from_fraud
  AFTER INSERT ON public.fraud_signals
  FOR EACH ROW EXECUTE FUNCTION public.log_suspicious_access_from_fraud();

CREATE OR REPLACE FUNCTION public.log_suspicious_access_from_incident()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.resolved = false THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (
      NULL,
      'SUSPICIOUS_ACCESS',
      'security_incidents',
      NEW.id,
      jsonb_build_object(
        'event_type', NEW.event_type,
        'severity', NEW.severity,
        'description', NEW.description
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_suspicious_access_from_incident ON public.security_incidents;
CREATE TRIGGER trg_log_suspicious_access_from_incident
  AFTER INSERT ON public.security_incidents
  FOR EACH ROW EXECUTE FUNCTION public.log_suspicious_access_from_incident();
