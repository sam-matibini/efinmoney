-- Verto corporate clearing: partner mapping, transfer log, and payment-partner seed.

ALTER TABLE public.payment_partners
  ADD COLUMN IF NOT EXISTS verto_company_id text,
  ADD COLUMN IF NOT EXISTS verto_beneficiary_id text,
  ADD COLUMN IF NOT EXISTS verto_purpose_id text;

COMMENT ON COLUMN public.payment_partners.verto_company_id IS 'Verto companyId for WALLET_TO_BUSINESS (V-Pay) partner settlements';
COMMENT ON COLUMN public.payment_partners.verto_beneficiary_id IS 'Approved Verto beneficiary/account id for WALLET_PAYOUT to the partner bank';
COMMENT ON COLUMN public.payment_partners.verto_purpose_id IS 'Optional Verto purposeId override for this partner';

CREATE TABLE IF NOT EXISTS public.verto_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type text NOT NULL CHECK (flow_type IN ('fx', 'vpay', 'payout', 'wallet')),
  status text NOT NULL DEFAULT 'requested',
  mode text NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'mock')),
  source_currency text NOT NULL,
  dest_currency text,
  source_amount numeric NOT NULL,
  dest_amount numeric,
  fx_rate numeric,
  source_wallet_id text,
  dest_wallet_id text,
  partner_id uuid REFERENCES public.payment_partners(id) ON DELETE SET NULL,
  target_company_id text,
  target_account_id text,
  purpose_id text,
  payment_id text,
  client_reference text,
  transfer_id uuid,
  settlement_id uuid,
  error_message text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verto_transfers_created_at_idx ON public.verto_transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS verto_transfers_partner_idx ON public.verto_transfers (partner_id);
CREATE INDEX IF NOT EXISTS verto_transfers_payment_id_idx ON public.verto_transfers (payment_id);

ALTER TABLE public.verto_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verto_transfers_staff_all ON public.verto_transfers;
CREATE POLICY verto_transfers_staff_all ON public.verto_transfers
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  );

GRANT ALL ON public.verto_transfers TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.verto_transfers TO authenticated;

INSERT INTO public.payment_partners
  (code, name, direction, country, api_status, integration_status, settlement_currency,
   supported_currencies, supported_countries, payment_methods, payout_function_slug, balance_function_slug,
   settlement_time, reliability_score, compliance_risk, priority, status, liquidity_stale_minutes, notes)
VALUES
  (
    'verto',
    'Verto',
    'both',
    'GB',
    'active',
    'active',
    'USD',
    ARRAY['USD','EUR','GBP','CAD','NGN','GHS','KES','ZAR','AED','AUD']::text[],
    ARRAY['GB','US','CA','NG','GH','KE','ZA','AE','DE','FR']::text[],
    ARRAY['bank','wallet','vpay','corporate']::text[],
    'verto-payout',
    'partner-balance-verto',
    'minutes',
    96,
    'low',
    25,
    'active',
    30,
    'Corporate FX, V-Pay and partner bank payouts via Verto wallets (docs.verto.co).'
  )
ON CONFLICT (code) DO UPDATE SET
  payout_function_slug = EXCLUDED.payout_function_slug,
  balance_function_slug = EXCLUDED.balance_function_slug,
  supported_currencies = EXCLUDED.supported_currencies,
  supported_countries = EXCLUDED.supported_countries,
  payment_methods = EXCLUDED.payment_methods,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, v.direction::public.partner_direction, v.src_country, v.dst_country, v.src_ccy, v.dst_ccy, v.method, true, v.mins, false
FROM (VALUES
  ('verto','payout','CA','NG','CAD','NGN','bank',15),
  ('verto','payout','CA','GB','CAD','GBP','bank',15),
  ('verto','payout','CA','US','CAD','USD','bank',15),
  ('verto','payout','CA','DE','CAD','EUR','bank',15),
  ('verto','payout','US','NG','USD','NGN','bank',15),
  ('verto','payout','GB','NG','GBP','NGN','bank',15),
  ('verto','payout','CA','GH','CAD','GHS','bank',20),
  ('verto','payout','CA','KE','CAD','KES','bank',20),
  ('verto','payout','CA','ZA','CAD','ZAR','bank',20),
  ('verto','payin','GB','CA','GBP','CAD','wallet',10),
  ('verto','payin','US','CA','USD','CAD','wallet',10)
) AS v(code, direction, src_country, dst_country, src_ccy, dst_ccy, method, mins)
JOIN public.payment_partners p ON p.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_corridors c
  WHERE c.partner_id = p.id
    AND c.direction = v.direction::public.partner_direction
    AND coalesce(c.source_currency,'') = v.src_ccy
    AND coalesce(c.dest_currency,'') = v.dst_ccy
    AND coalesce(c.dest_country,'') = v.dst_country
    AND coalesce(c.payment_method,'') = v.method
);
