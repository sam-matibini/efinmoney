-- Checkout needs to read live corridor provider FX so customer quotes can
-- benchmark against partner_fx_rates + eFinMoney's internal margin.
CREATE POLICY "authenticated read partner fx rates"
  ON public.partner_fx_rates
  FOR SELECT
  TO authenticated
  USING (true);
