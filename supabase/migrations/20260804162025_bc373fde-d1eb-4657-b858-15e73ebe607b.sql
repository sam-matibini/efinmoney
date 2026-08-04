CREATE TABLE IF NOT EXISTS public.card_secrets (
  card_id UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  pan_encrypted TEXT NOT NULL,
  cvv_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.card_secrets TO service_role;
ALTER TABLE public.card_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.virtual_card_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  wallet_id UUID,
  direction TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'CAD',
  journal_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.virtual_card_transfers TO authenticated;
GRANT ALL ON public.virtual_card_transfers TO service_role;
ALTER TABLE public.virtual_card_transfers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users view own card transfers" ON public.virtual_card_transfers FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;