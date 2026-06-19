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

NOTIFY pgrst, 'reload schema';
