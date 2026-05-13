
-- Add Stripe customer link on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Saved Stripe payment methods
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL UNIQUE,
  card_brand TEXT,
  last_four TEXT,
  exp_month INT,
  exp_year INT,
  cardholder_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_payment_methods_user_id_idx
  ON public.saved_payment_methods(user_id);

ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users view own saved cards"
  ON public.saved_payment_methods
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users insert own saved cards"
  ON public.saved_payment_methods
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users update own saved cards"
  ON public.saved_payment_methods
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own saved cards" ON public.saved_payment_methods;
CREATE POLICY "Users delete own saved cards"
  ON public.saved_payment_methods
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: only one default card per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_saved_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.saved_payment_methods
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_saved_card ON public.saved_payment_methods;
CREATE TRIGGER trg_single_default_saved_card
AFTER INSERT OR UPDATE OF is_default ON public.saved_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_saved_card();
