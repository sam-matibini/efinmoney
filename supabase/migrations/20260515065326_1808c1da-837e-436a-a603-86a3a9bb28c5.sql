
CREATE TABLE public.stripe_payout_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text,
  last4 text,
  brand text,
  stripe_account_id text NOT NULL,
  stripe_external_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_payout_recipients_user ON public.stripe_payout_recipients(user_id);

ALTER TABLE public.stripe_payout_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own stripe payout recipients"
  ON public.stripe_payout_recipients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own stripe payout recipients"
  ON public.stripe_payout_recipients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own stripe payout recipients"
  ON public.stripe_payout_recipients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own stripe payout recipients"
  ON public.stripe_payout_recipients FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_stripe_payout_recipients_updated_at
  BEFORE UPDATE ON public.stripe_payout_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS stripe_payout_id text;
