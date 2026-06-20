
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

UPDATE public.cards c
   SET currency_code = w.currency_code
  FROM public.wallets w
 WHERE c.wallet_id = w.id
   AND c.currency_code IS NULL;
