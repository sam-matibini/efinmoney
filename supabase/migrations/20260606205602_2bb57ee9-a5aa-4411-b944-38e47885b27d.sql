CREATE TABLE IF NOT EXISTS public.crossmint_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chain text NOT NULL,
  address text NOT NULL,
  locator text NOT NULL,
  env text NOT NULL DEFAULT 'staging',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, env)
);

GRANT SELECT ON public.crossmint_wallets TO authenticated;
GRANT ALL ON public.crossmint_wallets TO service_role;

ALTER TABLE public.crossmint_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own crossmint wallets"
  ON public.crossmint_wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_crossmint_wallets_updated_at
  BEFORE UPDATE ON public.crossmint_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crossmint_yellowcard_transfers
  ADD COLUMN IF NOT EXISTS smart_wallet_address text,
  ADD COLUMN IF NOT EXISTS payout_tx_hash text;