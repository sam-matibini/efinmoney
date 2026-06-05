CREATE TABLE public.stripe_connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  country text NOT NULL,
  display_name text,
  contact_email text,
  dashboard text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'pending',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stripe_connected_accounts_user_unique ON public.stripe_connected_accounts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_connected_accounts TO authenticated;
GRANT ALL ON public.stripe_connected_accounts TO service_role;

ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connected account"
  ON public.stripe_connected_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own connected account"
  ON public.stripe_connected_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_stripe_connected_accounts
  BEFORE UPDATE ON public.stripe_connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();