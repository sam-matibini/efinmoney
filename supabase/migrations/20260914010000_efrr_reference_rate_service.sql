-- eFinMoney FX Reference Rate (EFRR) + immutable execution snapshots.
-- Tier 1 Bank of Canada, Tier 2 Open Exchange Rates, Tier 3 ECB validation,
-- Tier 4 partner execution rate. Customer quote = liquidity-aware benchmark
-- × (1 − internal EX spread). Snapshots are insert-only for FINTRAC / RPAA.

CREATE SEQUENCE IF NOT EXISTS public.efrr_rate_seq;

CREATE OR REPLACE FUNCTION public.next_efrr_rate_id()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'FX-' || to_char((timezone('UTC', now())), 'YYYYMMDD') || '-'
    || lpad(nextval('public.efrr_rate_seq')::text, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS public.efrr_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_series text,
  base_currency varchar(10) NOT NULL,
  quote_currency varchar(10) NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  observed_at timestamptz NOT NULL,
  published_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efrr_observations_lookup_idx
  ON public.efrr_observations (source, base_currency, quote_currency, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.efrr_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id text NOT NULL UNIQUE DEFAULT public.next_efrr_rate_id(),
  from_currency varchar(10) NOT NULL,
  to_currency varchar(10) NOT NULL,
  reference_rate numeric NOT NULL CHECK (reference_rate > 0),
  primary_source text NOT NULL,
  primary_rate numeric,
  primary_observed_at timestamptz,
  fallback_source text,
  fallback_rate numeric,
  validation_source text,
  validation_rate numeric,
  validation_delta_bps numeric,
  validation_status text NOT NULL DEFAULT 'unchecked',
  status text NOT NULL DEFAULT 'published',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efrr_rates_pair_idx
  ON public.efrr_rates (from_currency, to_currency, valid_from DESC);

CREATE TABLE IF NOT EXISTS public.fx_execution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id text NOT NULL,
  transfer_id uuid,
  fx_transaction_id uuid,
  transaction_ref text,
  source text NOT NULL,
  source_rate numeric NOT NULL,
  source_timestamp timestamptz,
  base_currency varchar(10) NOT NULL,
  quote_currency varchar(10) NOT NULL,
  reference_rate numeric NOT NULL,
  efin_spread numeric NOT NULL DEFAULT 0,
  customer_rate numeric NOT NULL,
  rate_timestamp timestamptz NOT NULL DEFAULT now(),
  provider_execution_rate numeric,
  partner text,
  fx_revenue numeric,
  fee_amount numeric,
  source_amount numeric,
  customer_amount numeric,
  transaction_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_execution_snapshots_subject CHECK (
    transfer_id IS NOT NULL OR fx_transaction_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fx_execution_snapshots_transfer_uidx
  ON public.fx_execution_snapshots (transfer_id) WHERE transfer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fx_execution_snapshots_fx_tx_uidx
  ON public.fx_execution_snapshots (fx_transaction_id) WHERE fx_transaction_id IS NOT NULL;

COMMENT ON TABLE public.efrr_rates IS
  'eFinMoney EFX Reference Rate. BoC primary, OXR fallback. Not a customer quote.';
COMMENT ON TABLE public.fx_execution_snapshots IS
  'Immutable FINTRAC/RPAA FX audit record. Insert-only after transaction execution.';

GRANT SELECT ON public.efrr_observations, public.efrr_rates, public.fx_execution_snapshots TO authenticated;
GRANT ALL ON public.efrr_observations, public.efrr_rates, public.fx_execution_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.efrr_rate_seq TO service_role;

ALTER TABLE public.efrr_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efrr_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_execution_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read efrr observations" ON public.efrr_observations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read efrr rates" ON public.efrr_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing managers write efrr" ON public.efrr_rates
  FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE POLICY "users read own fx snapshots" ON public.fx_execution_snapshots
  FOR SELECT TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR transfer_id IN (SELECT id FROM public.transfers WHERE sender_id = auth.uid())
    OR fx_transaction_id IN (SELECT id FROM public.fx_transactions WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.fx_execution_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fx_execution_snapshots are immutable after insert';
END;
$$;

DROP TRIGGER IF EXISTS trg_fx_execution_snapshots_no_update ON public.fx_execution_snapshots;
CREATE TRIGGER trg_fx_execution_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.fx_execution_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fx_execution_snapshots_immutable();

CREATE OR REPLACE FUNCTION public.freeze_fx_snapshot(
  p_transfer_id uuid DEFAULT NULL,
  p_fx_transaction_id uuid DEFAULT NULL,
  p_from_currency text DEFAULT NULL,
  p_to_currency text DEFAULT NULL,
  p_customer_rate numeric DEFAULT NULL,
  p_efin_spread numeric DEFAULT 0,
  p_provider_execution_rate numeric DEFAULT NULL,
  p_partner text DEFAULT NULL,
  p_source_amount numeric DEFAULT NULL,
  p_customer_amount numeric DEFAULT NULL,
  p_fee_amount numeric DEFAULT NULL,
  p_transaction_status text DEFAULT NULL,
  p_transaction_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_from text;
  v_to text;
  v_efrr public.efrr_rates%ROWTYPE;
  v_customer numeric;
  v_id uuid;
  v_revenue numeric;
BEGIN
  IF p_transfer_id IS NULL AND p_fx_transaction_id IS NULL THEN
    RAISE EXCEPTION 'transfer_id or fx_transaction_id is required';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF p_transfer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transfers t
       WHERE t.id = p_transfer_id
         AND (t.sender_id = auth.uid() OR public.is_pricing_manager(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'not allowed to freeze this transfer';
    END IF;
    IF p_fx_transaction_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fx_transactions f
       WHERE f.id = p_fx_transaction_id
         AND (f.user_id = auth.uid() OR public.is_pricing_manager(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'not allowed to freeze this FX transaction';
    END IF;
  END IF;

  SELECT id INTO v_id FROM public.fx_execution_snapshots
   WHERE (p_transfer_id IS NOT NULL AND transfer_id = p_transfer_id)
      OR (p_fx_transaction_id IS NOT NULL AND fx_transaction_id = p_fx_transaction_id)
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_from := upper(coalesce(p_from_currency, ''));
  v_to := upper(coalesce(p_to_currency, ''));

  IF p_transfer_id IS NOT NULL AND (v_from = '' OR v_to = '') THEN
    SELECT t.source_currency, t.target_currency, t.exchange_rate, t.source_amount, t.target_amount, t.fee_amount, t.status::text
      INTO v_from, v_to, v_customer, p_source_amount, p_customer_amount, p_fee_amount, p_transaction_status
    FROM public.transfers t WHERE t.id = p_transfer_id;
  END IF;

  IF p_fx_transaction_id IS NOT NULL AND (v_from = '' OR v_to = '') THEN
    SELECT f.from_currency, f.to_currency, f.effective_rate, f.from_amount, f.to_amount, f.fee_amount, f.status::text
      INTO v_from, v_to, v_customer, p_source_amount, p_customer_amount, p_fee_amount, p_transaction_status
    FROM public.fx_transactions f WHERE f.id = p_fx_transaction_id;
  END IF;

  v_customer := coalesce(p_customer_rate, v_customer, 0);
  IF v_from IS NULL OR v_to IS NULL OR v_from = '' OR v_to = '' OR v_customer <= 0 THEN
    RAISE EXCEPTION 'FX snapshot requires currencies and a customer rate';
  END IF;

  SELECT * INTO v_efrr
    FROM public.efrr_rates
   WHERE from_currency = v_from AND to_currency = v_to AND status = 'published'
   ORDER BY valid_from DESC
   LIMIT 1;

  IF v_efrr.id IS NULL THEN
    SELECT er.rate_id, er.reference_rate, er.primary_source, er.primary_rate, er.primary_observed_at
      INTO v_efrr.rate_id, v_efrr.reference_rate, v_efrr.primary_source, v_efrr.primary_rate, v_efrr.primary_observed_at
    FROM (
      SELECT public.next_efrr_rate_id() AS rate_id,
             r.rate AS reference_rate,
             coalesce(r.source, 'fx_rates') AS primary_source,
             r.rate AS primary_rate,
             r.valid_from AS primary_observed_at
        FROM public.fx_rates r
       WHERE r.from_currency = v_from AND r.to_currency = v_to
       ORDER BY r.valid_from DESC
       LIMIT 1
    ) er;
  END IF;

  IF v_efrr.rate_id IS NULL THEN
    v_efrr.rate_id := public.next_efrr_rate_id();
    v_efrr.reference_rate := v_customer;
    v_efrr.primary_source := 'unavailable';
    v_efrr.primary_rate := v_customer;
    v_efrr.primary_observed_at := now();
  END IF;

  IF p_provider_execution_rate IS NOT NULL AND p_source_amount IS NOT NULL THEN
    v_revenue := (p_provider_execution_rate - v_customer) * p_source_amount;
  END IF;

  INSERT INTO public.fx_execution_snapshots (
    rate_id, transfer_id, fx_transaction_id, transaction_ref,
    source, source_rate, source_timestamp,
    base_currency, quote_currency, reference_rate, efin_spread, customer_rate,
    provider_execution_rate, partner, fx_revenue, fee_amount, source_amount,
    customer_amount, transaction_status, payload
  ) VALUES (
    v_efrr.rate_id,
    p_transfer_id,
    p_fx_transaction_id,
    coalesce(p_transaction_ref, 'EF' || to_char(timezone('UTC', now()), 'YYYYMMDD') || substr(replace(coalesce(p_transfer_id, p_fx_transaction_id)::text, '-', ''), 1, 6)),
    coalesce(v_efrr.primary_source, 'efrr'),
    coalesce(v_efrr.primary_rate, v_efrr.reference_rate),
    v_efrr.primary_observed_at,
    v_from, v_to,
    v_efrr.reference_rate,
    coalesce(p_efin_spread, 0),
    v_customer,
    p_provider_execution_rate,
    p_partner,
    v_revenue,
    p_fee_amount,
    p_source_amount,
    p_customer_amount,
    p_transaction_status,
    jsonb_build_object(
      'primary_source', v_efrr.primary_source,
      'fallback_source', v_efrr.fallback_source,
      'validation_source', v_efrr.validation_source,
      'validation_delta_bps', v_efrr.validation_delta_bps,
      'validation_status', v_efrr.validation_status
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_fx_snapshot FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freeze_fx_snapshot TO authenticated, service_role;
