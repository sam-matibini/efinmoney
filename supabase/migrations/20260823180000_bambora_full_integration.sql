-- Bambora / Worldline NAM: saved cards, EFT bank profiles, async EFT collection tracking

CREATE TABLE IF NOT EXISTS public.bambora_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_code TEXT NOT NULL,
  method_type TEXT NOT NULL CHECK (method_type IN ('card', 'bank')),
  bambora_card_id INT,
  card_brand TEXT,
  last_four TEXT,
  exp_month INT,
  exp_year INT,
  cardholder_name TEXT,
  institution_number TEXT,
  branch_number TEXT,
  account_last_four TEXT,
  bank_account_holder TEXT,
  currency_code TEXT NOT NULL DEFAULT 'CAD',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bambora_payment_methods_user_idx
  ON public.bambora_payment_methods(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS bambora_payment_methods_card_uidx
  ON public.bambora_payment_methods(user_id, customer_code, bambora_card_id)
  WHERE method_type = 'card' AND bambora_card_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bambora_payment_methods_bank_uidx
  ON public.bambora_payment_methods(user_id, customer_code)
  WHERE method_type = 'bank';

CREATE TABLE IF NOT EXISTS public.bambora_eft_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'CAD',
  customer_code TEXT NOT NULL,
  batch_id TEXT,
  batch_message TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'processing', 'settled', 'returned', 'failed', 'credited')),
  external_reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bambora_eft_collections_user_idx
  ON public.bambora_eft_collections(user_id);

CREATE INDEX IF NOT EXISTS bambora_eft_collections_status_idx
  ON public.bambora_eft_collections(status)
  WHERE status IN ('submitted', 'processing', 'settled');

ALTER TABLE public.bambora_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bambora_eft_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own bambora methods" ON public.bambora_payment_methods;
CREATE POLICY "Users view own bambora methods"
  ON public.bambora_payment_methods FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users delete own bambora methods" ON public.bambora_payment_methods;
CREATE POLICY "Users delete own bambora methods"
  ON public.bambora_payment_methods FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own bambora eft" ON public.bambora_eft_collections;
CREATE POLICY "Users view own bambora eft"
  ON public.bambora_eft_collections FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enforce_single_default_bambora_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.bambora_payment_methods
       SET is_default = false, updated_at = now()
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND method_type = NEW.method_type
       AND is_default = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_bambora_method ON public.bambora_payment_methods;
CREATE TRIGGER trg_single_default_bambora_method
AFTER INSERT OR UPDATE OF is_default ON public.bambora_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_bambora_method();
