-- Require the payer to confirm amount transferred + qty 1 before settling.
DROP FUNCTION IF EXISTS public.complete_fincra_interac_etransfer(uuid, text);
DROP FUNCTION IF EXISTS public.complete_fincra_interac_etransfer(uuid, text, numeric, integer);

CREATE OR REPLACE FUNCTION public.complete_fincra_interac_etransfer(
  p_intent_id uuid,
  p_interac_reference text,
  p_amount_transferred numeric,
  p_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.fincra_cad_interac_intents%ROWTYPE;
  cleaned text := btrim(p_interac_reference);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF cleaned IS NULL OR length(cleaned) < 4 OR length(cleaned) > 32 THEN
    RAISE EXCEPTION 'Enter the Interac reference from your bank confirmation';
  END IF;
  IF p_qty IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Quantity must be 1 (one order)';
  END IF;

  SELECT * INTO rec
  FROM public.fincra_cad_interac_intents
  WHERE id = p_intent_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intent not found';
  END IF;

  IF p_amount_transferred IS NULL
     OR round(p_amount_transferred * 100) <> round(rec.amount * 100) THEN
    RAISE EXCEPTION 'Amount transferred must match the checkout amount';
  END IF;

  UPDATE public.fincra_cad_interac_intents
  SET
    provider_reference = cleaned,
    claimed_sent_at = COALESCE(claimed_sent_at, now()),
    confirmed_at = now(),
    status = CASE
      WHEN status IN ('settled', 'completed') THEN status
      ELSE 'settled'
    END
  WHERE id = rec.id
  RETURNING * INTO rec;

  RETURN jsonb_build_object('ok', true, 'id', rec.id, 'status', rec.status, 'provider_reference', rec.provider_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_fincra_interac_etransfer(uuid, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_fincra_interac_etransfer(uuid, text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fincra_interac_etransfer(uuid, text, numeric, integer) TO service_role;
