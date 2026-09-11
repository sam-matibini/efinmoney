-- Cost-recovery pricing: administrator-controlled rate cards, volume
-- discounts, payout-method minimums, and cost-recovery floors.
-- Starting commercial rates (effective 2026-09-10) — not hard-coded fees.

CREATE TABLE IF NOT EXISTS public.corridor_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id text NOT NULL,
  source_currency text NOT NULL,
  destination_currency text NOT NULL,
  payout_method text NOT NULL,
  channel text NOT NULL DEFAULT 'external' CHECK (channel IN ('wallet', 'external')),
  delivery text,
  partner text,
  partner_cost_pct numeric NOT NULL DEFAULT 0,
  partner_fixed_fee numeric NOT NULL DEFAULT 0,
  payment_cost_pct numeric NOT NULL DEFAULT 0,
  payment_fixed_fee numeric NOT NULL DEFAULT 0,
  payout_cost_fixed numeric NOT NULL DEFAULT 0,
  liquidity_cost_pct numeric NOT NULL DEFAULT 0,
  risk_cost_pct numeric NOT NULL DEFAULT 0,
  required_margin numeric NOT NULL DEFAULT 0.75,
  efin_fx_spread numeric NOT NULL DEFAULT 0,
  efin_transfer_fee_pct numeric NOT NULL DEFAULT 0.005,
  transfer_fee numeric NOT NULL DEFAULT 0,
  minimum_fee numeric NOT NULL DEFAULT 0,
  maximum_fee numeric,
  fee_currency text NOT NULL DEFAULT 'CAD',
  recommended_position text,
  estimated_delivery text,
  volume_discount numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT DATE '2026-09-10',
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS corridor_rate_cards_current_idx
  ON public.corridor_rate_cards (corridor_id)
  WHERE active AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS corridor_rate_cards_lookup_idx
  ON public.corridor_rate_cards (channel, source_currency, destination_currency, payout_method, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.corridor_rate_card_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid,
  corridor_id text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE TABLE IF NOT EXISTS public.payout_method_minimums (
  payout_method text PRIMARY KEY,
  label text NOT NULL,
  minimum_fee numeric NOT NULL,
  fee_currency text NOT NULL DEFAULT 'CAD',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volume_discount_tiers (
  id text PRIMARY KEY,
  min_monthly_volume numeric NOT NULL,
  max_monthly_volume numeric,
  fx_spread_discount numeric,
  transfer_fee_discount numeric,
  label text NOT NULL,
  custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.corridor_rate_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read corridor rate cards"
  ON public.corridor_rate_cards FOR SELECT TO authenticated
  USING (active = true);
CREATE POLICY "pricing managers write corridor rate cards"
  ON public.corridor_rate_cards FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()));

ALTER TABLE public.corridor_rate_card_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers read rate card history"
  ON public.corridor_rate_card_history FOR SELECT TO authenticated
  USING (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()));

ALTER TABLE public.payout_method_minimums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read payout minimums"
  ON public.payout_method_minimums FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing managers write payout minimums"
  ON public.payout_method_minimums FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()));

ALTER TABLE public.volume_discount_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read volume discount tiers"
  ON public.volume_discount_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing managers write volume discount tiers"
  ON public.volume_discount_tiers FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()));

GRANT SELECT ON public.corridor_rate_cards, public.payout_method_minimums, public.volume_discount_tiers TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corridor_rate_cards, public.payout_method_minimums, public.volume_discount_tiers TO authenticated;
GRANT SELECT ON public.corridor_rate_card_history TO authenticated;
GRANT ALL ON public.corridor_rate_cards, public.payout_method_minimums, public.volume_discount_tiers, public.corridor_rate_card_history TO service_role;

CREATE OR REPLACE FUNCTION public.trg_corridor_rate_card_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.corridor_rate_card_history (rate_card_id, corridor_id, snapshot, changed_by)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.corridor_id, OLD.corridor_id),
    to_jsonb(COALESCE(NEW, OLD)),
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS corridor_rate_cards_history ON public.corridor_rate_cards;
CREATE TRIGGER corridor_rate_cards_history
  AFTER INSERT OR UPDATE OR DELETE ON public.corridor_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.trg_corridor_rate_card_history();

INSERT INTO public.payout_method_minimums (payout_method, label, minimum_fee, fee_currency) VALUES
  ('WALLET_TO_WALLET', 'eFinMoney wallet-to-wallet', 0.50, 'CAD'),
  ('BANK', 'Bank transfer', 1.50, 'CAD'),
  ('MOBILE_MONEY', 'Mobile Money', 3.49, 'CAD'),
  ('CASH_PICKUP', 'Cash pickup', 4.99, 'CAD'),
  ('CARD_PAYOUT', 'Card payout', 4.99, 'CAD'),
  ('STABLECOIN', 'Stablecoin', 1.50, 'CAD'),
  ('CORPORATE', 'Corporate payout', 5.00, 'CAD'),
  ('WALLET', 'External wallet', 1.50, 'CAD')
ON CONFLICT (payout_method) DO UPDATE SET
  label = EXCLUDED.label,
  minimum_fee = EXCLUDED.minimum_fee,
  fee_currency = EXCLUDED.fee_currency,
  updated_at = now();

INSERT INTO public.volume_discount_tiers
  (id, min_monthly_volume, max_monthly_volume, fx_spread_discount, transfer_fee_discount, label, custom, sort_order)
VALUES
  ('v0', 0, 999.99, 0, 0, 'Standard', false, 0),
  ('v1k', 1000, 4999.99, 0.05, 0.05, 'C$1,000 – C$4,999', false, 1),
  ('v5k', 5000, 9999.99, 0.10, 0.10, 'C$5,000 – C$9,999', false, 2),
  ('v10k', 10000, 24999.99, 0.15, 0.15, 'C$10,000 – C$24,999', false, 3),
  ('v25k', 25000, 49999.99, 0.20, 0.20, 'C$25,000 – C$49,999', false, 4),
  ('v50k', 50000, 99999.99, 0.25, 0.25, 'C$50,000 – C$99,999', false, 5),
  ('v100k', 100000, NULL, 0.25, 0.25, 'C$100,000+', true, 6)
ON CONFLICT (id) DO UPDATE SET
  min_monthly_volume = EXCLUDED.min_monthly_volume,
  max_monthly_volume = EXCLUDED.max_monthly_volume,
  fx_spread_discount = EXCLUDED.fx_spread_discount,
  transfer_fee_discount = EXCLUDED.transfer_fee_discount,
  label = EXCLUDED.label,
  custom = EXCLUDED.custom,
  sort_order = EXCLUDED.sort_order;

-- Starting CAD corridor + wallet cards (layer 2 commercial rates + layer 1 cost estimates)
INSERT INTO public.corridor_rate_cards (
  corridor_id, source_currency, destination_currency, payout_method, channel, delivery, partner,
  partner_cost_pct, partner_fixed_fee, payment_cost_pct, payment_fixed_fee, payout_cost_fixed,
  liquidity_cost_pct, risk_cost_pct, required_margin,
  efin_fx_spread, efin_transfer_fee_pct, transfer_fee, minimum_fee, maximum_fee, fee_currency,
  recommended_position, estimated_delivery, effective_from, active
)
VALUES
  ('CAD_USD_BANK', 'CAD', 'USD', 'BANK', 'external', 'Bank', NULL, 0.0015, 0.35, 0.0025, 0.15, 0, 0.0008, 0.0004, 0.50, 0.005, 0.005, 1.50, 1.50, 50, 'CAD', 'Highly competitive', '1–2 business days', '2026-09-10', true),
  ('CAD_USD_WALLET', 'CAD', 'USD', 'WALLET', 'external', 'Wallet', NULL, 0.002, 0.25, 0.0025, 0.15, 0, 0.0015, 0.001, 0.50, 0.006, 0.005, 1.50, 1.50, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_ZMW_MOBILE_MONEY', 'CAD', 'ZMW', 'MOBILE_MONEY', 'external', 'Mobile Money', 'PawaPay', 0.005, 0.75, 0.005, 0.25, 0, 0.002, 0.001, 0.75, 0.015, 0.005, 3.49, 3.49, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_ZMW_BANK', 'CAD', 'ZMW', 'BANK', 'external', 'Bank', 'PawaPay', 0.0045, 0.65, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0125, 0.005, 2.99, 2.99, 50, 'CAD', 'Competitive', 'Same day – 1 business day', '2026-09-10', true),
  ('CAD_NGN_BANK', 'CAD', 'NGN', 'BANK', 'external', 'Bank', 'Nomba', 0.0055, 0.60, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.015, 0.005, 3.49, 3.49, 50, 'CAD', 'Competitive', 'Minutes – 1 hour', '2026-09-10', true),
  ('CAD_NGN_WALLET', 'CAD', 'NGN', 'WALLET', 'external', 'Wallet', 'Nomba', 0.006, 0.70, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0175, 0.005, 3.99, 3.99, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_KES_MOBILE_MONEY', 'CAD', 'KES', 'MOBILE_MONEY', 'external', 'Mobile Money', 'PawaPay', 0.005, 0.70, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.015, 0.005, 3.49, 3.49, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_KES_BANK', 'CAD', 'KES', 'BANK', 'external', 'Bank', 'PawaPay', 0.0045, 0.60, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0125, 0.005, 2.99, 2.99, 50, 'CAD', 'Competitive', 'Same day – 1 business day', '2026-09-10', true),
  ('CAD_ZAR_BANK', 'CAD', 'ZAR', 'BANK', 'external', 'Bank', NULL, 0.0035, 0.55, 0.005, 0.25, 0, 0.0015, 0.001, 0.60, 0.01, 0.005, 2.49, 2.49, 50, 'CAD', 'Competitive', '1–2 business days', '2026-09-10', true),
  ('CAD_ZAR_WALLET', 'CAD', 'ZAR', 'WALLET', 'external', 'Wallet', NULL, 0.004, 0.50, 0.005, 0.25, 0, 0.0015, 0.001, 0.60, 0.0125, 0.005, 2.99, 2.99, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_ZWG_WALLET_BANK', 'CAD', 'ZWG', 'WALLET_BANK', 'external', 'Wallet/Bank', NULL, 0.008, 1.10, 0.005, 0.25, 0, 0.003, 0.004, 1.00, 0.02, 0.005, 4.49, 4.49, 50, 'CAD', 'Higher-risk corridor', 'Same day – 2 business days', '2026-09-10', true),
  ('CAD_UGX_MOBILE_MONEY', 'CAD', 'UGX', 'MOBILE_MONEY', 'external', 'Mobile Money', 'PawaPay', 0.006, 0.80, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0175, 0.005, 3.99, 3.99, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_TZS_MOBILE_MONEY', 'CAD', 'TZS', 'MOBILE_MONEY', 'external', 'Mobile Money', 'PawaPay', 0.006, 0.80, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0175, 0.005, 3.99, 3.99, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_BIF_MOBILE_MONEY_BANK', 'CAD', 'BIF', 'WALLET_BANK', 'external', 'Mobile Money/Bank', NULL, 0.008, 1.00, 0.005, 0.25, 0, 0.0025, 0.003, 1.00, 0.02, 0.005, 4.49, 4.49, 50, 'CAD', 'Higher-cost corridor', 'Same day – 2 business days', '2026-09-10', true),
  ('CAD_GHS_MOBILE_MONEY', 'CAD', 'GHS', 'MOBILE_MONEY', 'external', 'Mobile Money', 'PawaPay', 0.006, 0.75, 0.005, 0.25, 0, 0.0015, 0.001, 0.75, 0.0175, 0.005, 3.99, 3.99, 50, 'CAD', 'Competitive', 'Minutes', '2026-09-10', true),
  ('CAD_CDF_MOBILE_MONEY_BANK', 'CAD', 'CDF', 'WALLET_BANK', 'external', 'Mobile Money/Bank', NULL, 0.008, 1.00, 0.005, 0.25, 0, 0.0025, 0.003, 1.00, 0.02, 0.005, 4.49, 4.49, 50, 'CAD', 'Higher-cost corridor', 'Same day – 2 business days', '2026-09-10', true),
  ('WALLET_SAME_CURRENCY', '*', '*', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.0005, 0.0003, 0.15, 0, 0, 0.50, 0.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_USD', 'CAD', 'USD', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.0005, 0.0003, 0.15, 0.005, 0.005, 0.50, 0.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_USDC', 'CAD', 'USDC', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.0005, 0.0003, 0.15, 0.005, 0.005, 0.50, 0.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_USD_USDC', 'USD', 'USDC', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.0005, 0.0003, 0.12, 0.005, 0.005, 0.50, 0.50, 25, 'USD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_ZMW', 'CAD', 'ZMW', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.001, 0.0008, 0.35, 0.0125, 0.005, 1.50, 1.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_NGN', 'CAD', 'NGN', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.001, 0.0008, 0.35, 0.015, 0.005, 1.50, 1.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_KES', 'CAD', 'KES', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.001, 0.0008, 0.35, 0.0125, 0.005, 1.50, 1.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true),
  ('WALLET_CAD_ZAR', 'CAD', 'ZAR', 'WALLET_TO_WALLET', 'wallet', 'eFinMoney wallet', 'eFinMoney', 0, 0, 0, 0.05, 0, 0.001, 0.0006, 0.30, 0.01, 0.005, 1.50, 1.50, 25, 'CAD', 'Ecosystem', 'Instant', '2026-09-10', true);

-- Close the catch-all fx_swap that had no minimum (C$3 × 0.5% = C$0.01)
UPDATE public.efinmoney_pricing
   SET effective_to = now()
 WHERE payment_method = 'fx_swap'
   AND effective_to IS NULL;

INSERT INTO public.efinmoney_pricing
  (customer_type, direction, source_currency, dest_currency, dest_country, payment_method,
   fixed_fee, percentage_fee, fx_margin_bps, min_fee, max_fee, effective_from)
VALUES
  ('consumer', 'payout', 'CAD', 'USDC', NULL, 'fx_swap', 0.00, 0.50, 50, 0.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'USD',  NULL, 'fx_swap', 0.00, 0.50, 50, 0.50, 25, now()),
  ('consumer', 'payout', 'USD', 'USDC', NULL, 'fx_swap', 0.00, 0.50, 50, 0.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'ZMW',  NULL, 'fx_swap', 0.00, 0.50, 125, 1.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'NGN',  NULL, 'fx_swap', 0.00, 0.50, 150, 1.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'KES',  NULL, 'fx_swap', 0.00, 0.50, 125, 1.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'ZAR',  NULL, 'fx_swap', 0.00, 0.50, 100, 1.50, 25, now()),
  ('consumer', 'payout', 'CAD', 'GHS',  NULL, 'fx_swap', 0.00, 0.50, 175, 1.50, 25, now()),
  ('consumer', 'payout', '*',   '*',    NULL, 'fx_swap', 0.00, 0.50, 50, 0.50, 25, now()),
  -- External CAD corridors (consumer remittance)
  ('consumer', 'payout', 'CAD', 'USD',  'US', 'bank', 0.00, 0.50, 50, 1.50, 50, now()),
  ('consumer', 'payout', 'CAD', 'USD',  'US', 'wallet', 0.00, 0.50, 60, 1.50, 50, now()),
  ('consumer', 'payout', 'CAD', 'ZMW',  'ZM', 'mobile_money', 0.00, 0.50, 150, 3.49, 50, now()),
  ('consumer', 'payout', 'CAD', 'ZMW',  'ZM', 'bank', 0.00, 0.50, 125, 2.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'NGN',  'NG', 'bank', 0.00, 0.50, 150, 3.49, 50, now()),
  ('consumer', 'payout', 'CAD', 'NGN',  'NG', 'wallet', 0.00, 0.50, 175, 3.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'KES',  'KE', 'mobile_money', 0.00, 0.50, 150, 3.49, 50, now()),
  ('consumer', 'payout', 'CAD', 'KES',  'KE', 'bank', 0.00, 0.50, 125, 2.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'ZAR',  'ZA', 'bank', 0.00, 0.50, 100, 2.49, 50, now()),
  ('consumer', 'payout', 'CAD', 'ZAR',  'ZA', 'wallet', 0.00, 0.50, 125, 2.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'GHS',  'GH', 'mobile_money', 0.00, 0.50, 175, 3.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'UGX',  'UG', 'mobile_money', 0.00, 0.50, 175, 3.99, 50, now()),
  ('consumer', 'payout', 'CAD', 'TZS',  'TZ', 'mobile_money', 0.00, 0.50, 175, 3.99, 50, now());

CREATE OR REPLACE FUNCTION public.resolve_corridor_rate_card(
  p_source_currency text,
  p_dest_currency text,
  p_payout_method text DEFAULT 'WALLET_TO_WALLET',
  p_channel text DEFAULT 'wallet',
  p_partner text DEFAULT NULL,
  p_at date DEFAULT CURRENT_DATE
)
RETURNS SETOF public.corridor_rate_cards
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.*
  FROM public.corridor_rate_cards c
  WHERE c.active
    AND c.channel = p_channel
    AND c.effective_from <= p_at
    AND (c.effective_to IS NULL OR c.effective_to > p_at)
    AND (c.source_currency = '*' OR upper(c.source_currency) = upper(p_source_currency))
    AND (c.destination_currency = '*' OR upper(c.destination_currency) = upper(p_dest_currency))
    AND (
      c.payout_method = p_payout_method
      OR (c.payout_method = 'WALLET_BANK' AND p_payout_method IN ('WALLET', 'BANK', 'MOBILE_MONEY'))
    )
    AND (p_partner IS NULL OR c.partner IS NULL OR lower(c.partner) = lower(p_partner))
  ORDER BY
    (CASE WHEN c.source_currency = '*' THEN 0 ELSE 16 END)
  + (CASE WHEN c.destination_currency = '*' THEN 0 ELSE 16 END)
  + (CASE WHEN c.payout_method = p_payout_method THEN 8 ELSE 0 END)
  + (CASE WHEN p_partner IS NOT NULL AND c.partner IS NOT NULL AND lower(c.partner) = lower(p_partner) THEN 2 ELSE 0 END)
    DESC,
    c.effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_corridor_rate_card(text, text, text, text, text, date)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
