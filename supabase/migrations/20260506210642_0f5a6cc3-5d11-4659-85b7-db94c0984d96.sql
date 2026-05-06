CREATE TABLE public.beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  country_code text,
  payout_method text,
  network text,
  bank_name text,
  bank_account text,
  currency_code text,
  nickname text,
  avatar_initials text,
  transfer_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_beneficiaries_user_id ON public.beneficiaries(user_id);
CREATE INDEX idx_beneficiaries_user_phone ON public.beneficiaries(user_id, phone);

ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own beneficiaries" ON public.beneficiaries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own beneficiaries" ON public.beneficiaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own beneficiaries" ON public.beneficiaries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own beneficiaries" ON public.beneficiaries
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_beneficiaries_updated_at
  BEFORE UPDATE ON public.beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();