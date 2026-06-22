-- Run once in Supabase Dashboard → SQL Editor
-- Project: dkdnwumllibwdlqbjkwy (eFintax / eFinMoney)

-- =============================================================================
-- 1. Staff invites: skip consumer welcome email + wallet bootstrap for is_staff
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE((NEW.raw_user_meta_data->>'is_staff')::boolean, false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (user_id, email, account_status, kyc_framework_version)
  VALUES (NEW.id, NEW.email, 'pending_verification', 2)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
    (NEW.id, 'USD', true),
    (NEW.id, 'CAD', false);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.user_risk_tiers (
    user_id, current_tier,
    daily_transaction_limit, monthly_transaction_limit, single_transaction_limit,
    features_enabled
  )
  VALUES (
    NEW.id, 'tier_1', 500, 3000, 500,
    '{"receive":true,"send":true,"bills":true,"topup":true,"international":false,"virtual_card":false,"business":false}'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.kyc_verifications (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.invoke_send_email(
    'welcome',
    NEW.email,
    jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  );

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Ensure pg_net helpers point at THIS project (safe to re-run)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.invoke_send_email(p_type text, p_to text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', extensions
AS $$
DECLARE
  v_url text := 'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/send-email';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZG53dW1sbGlid2RscWJqa3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjE5MTIsImV4cCI6MjA3NzU5NzkxMn0.DxMKTL99wjiBUkqUZGfuDtYHFEQFHs9qJqlSJYLmKAk';
BEGIN
  IF p_to IS NULL OR p_to = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('type', p_type, 'to', p_to, 'data', p_data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_send_email failed: %', SQLERRM;
END;
$$;

-- =============================================================================
-- 3. Contacts / payees: beneficiaries payee-directory columns
--    (fixes "Could not find the 'category' column of 'beneficiaries'")
-- =============================================================================
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS eft_institution text,
  ADD COLUMN IF NOT EXISTS eft_transit text,
  ADD COLUMN IF NOT EXISTS eft_account text,
  ADD COLUMN IF NOT EXISTS eft_account_holder text,
  ADD COLUMN IF NOT EXISTS interac_email text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS beneficiaries_category_check;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT beneficiaries_category_check
  CHECK (category IN ('person','supplier','employee','contractor','payee','other'));

CREATE INDEX IF NOT EXISTS beneficiaries_user_category_idx
  ON public.beneficiaries(user_id, category);

-- =============================================================================
-- 4. Transaction PIN: fix profile lookup (user_id, not id)
--    Without this, PIN is never saved and "Create PIN" shows every send.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS transaction_pin_hash text,
  ADD COLUMN IF NOT EXISTS transaction_pin_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_pin_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_pin_locked_until timestamptz;

CREATE OR REPLACE FUNCTION public.has_transaction_pin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT transaction_pin_hash IS NOT NULL FROM public.profiles WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.set_transaction_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;
  UPDATE public.profiles
     SET transaction_pin_hash = crypt(p_pin, gen_salt('bf')),
         transaction_pin_set_at = now(),
         transaction_pin_failed_attempts = 0,
         transaction_pin_locked_until = null
   WHERE user_id = v_uid;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_transaction_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_failed integer;
  v_locked timestamptz;
  v_match boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT transaction_pin_hash, transaction_pin_failed_attempts, transaction_pin_locked_until
    INTO v_hash, v_failed, v_locked
    FROM public.profiles WHERE user_id = v_uid;
  IF v_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'no_pin', true, 'locked', false, 'attempts_left', 5);
  END IF;
  IF v_locked IS NOT NULL AND v_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked, 'attempts_left', 0);
  END IF;
  v_match := (v_hash = crypt(coalesce(p_pin, ''), v_hash));
  IF v_match THEN
    UPDATE public.profiles
       SET transaction_pin_failed_attempts = 0, transaction_pin_locked_until = null
     WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'locked', false, 'attempts_left', 5);
  END IF;
  v_failed := coalesce(v_failed, 0) + 1;
  IF v_failed >= 5 THEN
    UPDATE public.profiles
       SET transaction_pin_failed_attempts = v_failed,
           transaction_pin_locked_until = now() + interval '15 minutes'
     WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'locked', true,
      'locked_until', now() + interval '15 minutes', 'attempts_left', 0);
  ELSE
    UPDATE public.profiles
       SET transaction_pin_failed_attempts = v_failed
     WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'locked', false, 'attempts_left', 5 - v_failed);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_transaction_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_transaction_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transaction_pin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 5. Virtual card balances (fund from wallet, transfer between cards)
-- =============================================================================
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code varchar(10);

UPDATE public.cards c
   SET currency_code = w.currency_code
  FROM public.wallets w
 WHERE c.wallet_id = w.id
   AND c.currency_code IS NULL;

CREATE TABLE IF NOT EXISTS public.virtual_card_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  to_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  from_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency_code varchar(10) NOT NULL,
  transfer_type text NOT NULL CHECK (transfer_type IN ('wallet_to_card', 'card_to_card')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_card_transfers ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.virtual_card_transfers TO service_role;

DROP POLICY IF EXISTS "Users view own virtual card transfers" ON public.virtual_card_transfers;
CREATE POLICY "Users view own virtual card transfers"
  ON public.virtual_card_transfers FOR SELECT
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 6. Encrypted card secrets (PAN/CVV for wallet-issued virtual cards)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.card_secrets (
  card_id uuid PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  pan_encrypted text NOT NULL,
  cvv_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.card_secrets ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: only service-role edge functions may read/write.

GRANT ALL ON public.card_secrets TO service_role;

CREATE INDEX IF NOT EXISTS idx_card_secrets_card ON public.card_secrets(card_id);

NOTIFY pgrst, 'reload schema';
