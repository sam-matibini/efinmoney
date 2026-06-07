
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES ('4250', 'Top-up Fee Revenue', 'income', NULL, true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stripe_payin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_minor BIGINT NOT NULL,
  currency_code VARCHAR(10) NOT NULL,
  platform_fee_minor BIGINT NOT NULL DEFAULT 0,
  credit_amount NUMERIC(20,8) NOT NULL,
  credit_currency VARCHAR(10) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded','expired')),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_payin_sessions TO authenticated;
GRANT ALL ON public.stripe_payin_sessions TO service_role;

ALTER TABLE public.stripe_payin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own payin sessions"
  ON public.stripe_payin_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_stripe_payin_sessions_user ON public.stripe_payin_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_payin_sessions_session ON public.stripe_payin_sessions(stripe_session_id);

CREATE TRIGGER trg_stripe_payin_sessions_updated_at
  BEFORE UPDATE ON public.stripe_payin_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
