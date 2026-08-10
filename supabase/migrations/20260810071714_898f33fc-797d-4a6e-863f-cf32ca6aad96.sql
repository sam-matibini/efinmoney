DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['corridor_forecasts','cpn_corridors','efinmoney_pricing','fee_adjustment_settings','margin_floors','partner_alerts','partner_corridors','partner_fx_rates','partner_limits','partner_liquidity','partner_performance','partner_pricing','partner_score_weights','partner_scorecards','partner_settlements','partner_suspensions','payment_partners','pricing_config','pricing_proposals','routing_attempts','routing_decisions','routing_overrides','routing_rules','transaction_economics','partner_invoices','partner_invoice_lines']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';