GRANT SELECT, INSERT, UPDATE, DELETE ON public.fincra_cad_interac_intents TO authenticated;
GRANT ALL ON public.fincra_cad_interac_intents TO service_role;
NOTIFY pgrst, 'reload schema';