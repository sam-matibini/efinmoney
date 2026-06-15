
-- Restore client read access on tables that the app's hooks query with select=*.
-- The previous column-level revoke broke `SELECT *` for the owner role even
-- though RLS already restricts rows to auth.uid() = user_id.
-- Row-level policies remain the source of truth for visibility.

GRANT SELECT ON public.kyc_verifications              TO authenticated;
GRANT SELECT ON public.transfers                      TO authenticated;
GRANT SELECT ON public.plaid_items                    TO authenticated;
GRANT SELECT ON public.crossmint_yellowcard_transfers TO authenticated;

-- Keep service_role full access for edge functions / admin code.
GRANT ALL ON public.kyc_verifications              TO service_role;
GRANT ALL ON public.transfers                      TO service_role;
GRANT ALL ON public.plaid_items                    TO service_role;
GRANT ALL ON public.crossmint_yellowcard_transfers TO service_role;
