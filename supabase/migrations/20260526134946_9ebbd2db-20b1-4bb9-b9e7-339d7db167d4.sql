
-- 1. tier_limits reference table
CREATE TABLE public.tier_limits (
  tier public.user_risk_tier PRIMARY KEY,
  label text NOT NULL,
  max_balance numeric NOT NULL,
  daily_limit numeric NOT NULL,
  monthly_limit numeric NOT NULL,
  single_limit numeric NOT NULL,
  features_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tier_limits TO authenticated, anon;
GRANT ALL ON public.tier_limits TO service_role;

ALTER TABLE public.tier_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tier limits" ON public.tier_limits
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Admins manage tier limits" ON public.tier_limits
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_admin_user(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER set_updated_at_tier_limits
  BEFORE UPDATE ON public.tier_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tier_limits (tier, label, max_balance, daily_limit, monthly_limit, single_limit, features_enabled) VALUES
  ('tier_1','Minimal',  500,    500,    3000,   500,    '{"receive":true,"send":true,"bills":true,"topup":true,"international":false,"virtual_card":false,"business":false}'::jsonb),
  ('tier_2','Standard', 3000,   3000,   3000,   3000,   '{"receive":true,"send":true,"bills":true,"topup":true,"international":false,"virtual_card":true,"business":false}'::jsonb),
  ('tier_3','Enhanced', 10000,  5000,   10000,  10000,  '{"receive":true,"send":true,"bills":true,"topup":true,"international":true,"virtual_card":true,"business":true}'::jsonb),
  ('tier_4','Premium',  50000,  50000,  500000, 50000,  '{"receive":true,"send":true,"bills":true,"topup":true,"international":true,"virtual_card":true,"business":true}'::jsonb);

-- 2. Framework version flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_framework_version smallint NOT NULL DEFAULT 2;

-- Mark every existing user as legacy v1 so guards/trigger keep current behavior
UPDATE public.profiles SET kyc_framework_version = 1;

-- 3. Source-of-funds and tier target on kyc_verifications
ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS source_of_funds_url text,
  ADD COLUMN IF NOT EXISTS source_of_funds_type text,
  ADD COLUMN IF NOT EXISTS source_of_funds_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS address_proof_url text,
  ADD COLUMN IF NOT EXISTS tier_target public.user_risk_tier;

-- 4. Lower Tier 1 defaults for NEW signups (existing rows untouched)
ALTER TABLE public.user_risk_tiers
  ALTER COLUMN daily_transaction_limit SET DEFAULT 500,
  ALTER COLUMN monthly_transaction_limit SET DEFAULT 3000,
  ALTER COLUMN single_transaction_limit SET DEFAULT 500;

-- 5. Rewrite on_kyc_status_change to branch on framework version
CREATE OR REPLACE FUNCTION public.on_kyc_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acct text;
  v_has_acct text;
  v_new_tier text;
  v_framework smallint;
  v_limits public.tier_limits%ROWTYPE;
BEGIN
  IF NEW.verification_status = 'approved'
     AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN

    SELECT COALESCE(kyc_framework_version, 1) INTO v_framework
      FROM public.profiles WHERE user_id = NEW.user_id;

    IF v_framework = 2 THEN
      -- Progressive 3-tier model
      IF NEW.address_verification_status = 'approved'
         AND NEW.source_of_funds_status = 'approved' THEN
        v_new_tier := 'tier_3';
      ELSIF NEW.id_verification_status = 'approved' THEN
        v_new_tier := 'tier_2';
      END IF;
    ELSE
      -- Legacy v1: Persona ID approval = Tier 3 fast-track
      IF NEW.id_verification_status = 'approved' THEN
        v_new_tier := 'tier_3';
      END IF;
    END IF;

    IF v_new_tier IS NOT NULL THEN
      SELECT * INTO v_limits FROM public.tier_limits WHERE tier = v_new_tier::public.user_risk_tier;
      IF v_framework = 1 AND v_new_tier = 'tier_3' THEN
        -- Preserve legacy generous limits for existing users
        INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
        VALUES (NEW.user_id, 'tier_3', 50000, 500000, 50000,
                '{"receive":true,"send":true,"international":true,"virtual_card":true}'::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET
          current_tier = 'tier_3',
          daily_transaction_limit = 50000,
          monthly_transaction_limit = 500000,
          single_transaction_limit = 50000,
          features_enabled = '{"receive":true,"send":true,"international":true,"virtual_card":true}'::jsonb,
          upgraded_at = now(),
          updated_at = now();
      ELSE
        INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
        VALUES (NEW.user_id, v_new_tier::public.user_risk_tier, v_limits.daily_limit, v_limits.monthly_limit, v_limits.single_limit, v_limits.features_enabled, now())
        ON CONFLICT (user_id) DO UPDATE SET
          current_tier = v_new_tier::public.user_risk_tier,
          daily_transaction_limit = v_limits.daily_limit,
          monthly_transaction_limit = v_limits.monthly_limit,
          single_transaction_limit = v_limits.single_limit,
          features_enabled = v_limits.features_enabled,
          upgraded_at = now(),
          updated_at = now();
      END IF;
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number = v_acct,
            account_status = 'active',
            kyc_completed_at = now(),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now()),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    END IF;

    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text,
            'framework_v' || v_framework || ' → ' || COALESCE(v_new_tier,'no_tier_change'));
  END IF;
  RETURN NEW;
END;
$$;

-- 6. handle_new_user: stamp v2 framework + Tier 1 limits explicitly for new accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
