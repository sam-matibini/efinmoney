-- PostgREST requires explicit grants (RLS alone is not enough).
GRANT SELECT, DELETE ON public.bambora_payment_methods TO authenticated;
GRANT SELECT ON public.bambora_eft_collections TO authenticated;
