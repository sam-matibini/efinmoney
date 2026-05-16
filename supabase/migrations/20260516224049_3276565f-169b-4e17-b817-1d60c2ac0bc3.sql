ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS stellar_address TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_stellar_address_key ON public.wallets(stellar_address) WHERE stellar_address IS NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stellar_seed_encrypted TEXT;