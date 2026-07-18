-- Grants + RLS for Paytota payin (service_role insert from edge functions)

GRANT SELECT, INSERT, UPDATE ON public.paytota_payin_transactions TO authenticated;
GRANT ALL ON public.paytota_payin_transactions TO service_role;
GRANT ALL ON public.paytota_payin_transactions TO postgres;

DROP POLICY IF EXISTS paytota_payin_select_own ON public.paytota_payin_transactions;
CREATE POLICY paytota_payin_select_own ON public.paytota_payin_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

NOTIFY pgrst, 'reload schema';
