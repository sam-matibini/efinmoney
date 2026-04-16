-- Savings goals owned by individual users
CREATE TABLE public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
  source_wallet_id UUID,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own savings goals"
ON public.savings_goals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own savings goals"
ON public.savings_goals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings goals"
ON public.savings_goals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings goals"
ON public.savings_goals FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all savings goals"
ON public.savings_goals FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_savings_goals_updated_at
BEFORE UPDATE ON public.savings_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_savings_goals_user ON public.savings_goals(user_id, status);