-- Wise bank-deposit top-up intents + settlement ledger accounts (1320+; avoid 1300 FX Liquidity / Dodo 1295+).

CREATE TABLE IF NOT EXISTS public.wise_topup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  provider_reference text,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours')
);

CREATE INDEX IF NOT EXISTS wise_topup_intents_pending_match_idx
  ON public.wise_topup_intents (status, currency_code, amount, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS wise_topup_intents_user_idx
  ON public.wise_topup_intents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wise_topup_intents_reference_idx
  ON public.wise_topup_intents (reference);

ALTER TABLE public.wise_topup_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own Wise top-up intents" ON public.wise_topup_intents;
CREATE POLICY "Users can read own Wise top-up intents"
  ON public.wise_topup_intents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.wise_topup_intents TO authenticated;
GRANT ALL ON public.wise_topup_intents TO service_role;

COMMENT ON TABLE public.wise_topup_intents IS
  'User-declared Wise bank-deposit top-ups; matched via balances#credit webhook (reference preferred, else amount+currency).';

-- Wise settlement asset accounts (1320+)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES
  ('1320', 'Wise Settlement USD', 'asset', 'USD', true),
  ('1321', 'Wise Settlement CAD', 'asset', 'CAD', true),
  ('1322', 'Wise Settlement EUR', 'asset', 'EUR', true),
  ('1323', 'Wise Settlement GBP', 'asset', 'GBP', true),
  ('1324', 'Wise Settlement NGN', 'asset', 'NGN', true),
  ('1325', 'Wise Settlement GHS', 'asset', 'GHS', true),
  ('1326', 'Wise Settlement KES', 'asset', 'KES', true),
  ('1327', 'Wise Settlement UGX', 'asset', 'UGX', true),
  ('1328', 'Wise Settlement ZAR', 'asset', 'ZAR', true),
  ('1329', 'Wise Settlement AUD', 'asset', 'AUD', true),
  ('1330', 'Wise Settlement NZD', 'asset', 'NZD', true),
  ('1331', 'Wise Settlement SGD', 'asset', 'SGD', true),
  ('1332', 'Wise Settlement HKD', 'asset', 'HKD', true),
  ('1333', 'Wise Settlement PLN', 'asset', 'PLN', true),
  ('1334', 'Wise Settlement RON', 'asset', 'RON', true),
  ('1335', 'Wise Settlement CZK', 'asset', 'CZK', true),
  ('1336', 'Wise Settlement HUF', 'asset', 'HUF', true),
  ('1337', 'Wise Settlement TRY', 'asset', 'TRY', true),
  ('1338', 'Wise Settlement INR', 'asset', 'INR', true),
  ('1339', 'Wise Settlement PHP', 'asset', 'PHP', true),
  ('1340', 'Wise Settlement MYR', 'asset', 'MYR', true),
  ('1341', 'Wise Settlement THB', 'asset', 'THB', true),
  ('1342', 'Wise Settlement IDR', 'asset', 'IDR', true),
  ('1343', 'Wise Settlement JPY', 'asset', 'JPY', true),
  ('1344', 'Wise Settlement CHF', 'asset', 'CHF', true),
  ('1345', 'Wise Settlement SEK', 'asset', 'SEK', true),
  ('1346', 'Wise Settlement NOK', 'asset', 'NOK', true),
  ('1347', 'Wise Settlement DKK', 'asset', 'DKK', true),
  ('1348', 'Wise Settlement MXN', 'asset', 'MXN', true),
  ('1349', 'Wise Settlement BRL', 'asset', 'BRL', true)
ON CONFLICT (code) DO NOTHING;
