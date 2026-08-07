REVOKE ALL ON TABLE
  public.payment_partners,
  public.partner_corridors,
  public.partner_pricing,
  public.partner_fx_rates,
  public.efinmoney_pricing,
  public.partner_liquidity,
  public.routing_rules,
  public.routing_decisions,
  public.routing_attempts,
  public.partner_performance,
  public.partner_limits,
  public.routing_overrides,
  public.partner_scorecards,
  public.partner_score_weights,
  public.margin_floors,
  public.transaction_economics,
  public.pricing_proposals,
  public.fee_adjustment_settings
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.payment_partners,
  public.partner_corridors,
  public.partner_pricing,
  public.partner_fx_rates,
  public.efinmoney_pricing,
  public.partner_liquidity,
  public.routing_rules,
  public.partner_limits,
  public.routing_overrides,
  public.margin_floors,
  public.pricing_proposals,
  public.fee_adjustment_settings
TO authenticated;

GRANT SELECT ON TABLE
  public.routing_decisions,
  public.routing_attempts,
  public.partner_performance,
  public.partner_scorecards,
  public.transaction_economics
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.partner_score_weights
TO authenticated;

GRANT ALL ON TABLE
  public.payment_partners,
  public.partner_corridors,
  public.partner_pricing,
  public.partner_fx_rates,
  public.efinmoney_pricing,
  public.partner_liquidity,
  public.routing_rules,
  public.routing_decisions,
  public.routing_attempts,
  public.partner_performance,
  public.partner_limits,
  public.routing_overrides,
  public.partner_scorecards,
  public.partner_score_weights,
  public.margin_floors,
  public.transaction_economics,
  public.pricing_proposals,
  public.fee_adjustment_settings
TO service_role;