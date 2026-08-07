DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kyc_verifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.kyc_verifications;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transfers'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.transfers;
  END IF;
END
$$;