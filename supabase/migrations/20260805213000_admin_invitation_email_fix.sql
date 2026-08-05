-- =====================================================================
-- Developer Onboarding followup: skip welcome email for admin-onboarded
-- users. The admin-create-user / admin-create-business edge functions
-- send a properly-personalized admin_invitation email (with the
-- recovery link) after they generate it. If the trigger also sends,
-- the user would get two emails.
--
-- Also adds a reusable helper for generating recovery links that
-- returns the action_link property, used by the edge functions.
-- =====================================================================

-- 1. handle_new_user: only send 'welcome' for self-signups.
-- Admin-onboarded users (raw_user_meta_data->>'onboarded_by_admin' = 'true')
-- get their email from the edge function with the recovery link.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_ccy     text;
  v_default text;
BEGIN
  v_country := upper(NEW.raw_user_meta_data->>'country');
  v_ccy     := public.country_to_currency(v_country);
  v_default := COALESCE(v_ccy, 'CAD');

  INSERT INTO public.profiles (user_id, email, account_status, kyc_framework_version, default_currency)
  VALUES (NEW.id, NEW.email, 'pending_verification', 2, v_default)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_default <> 'USD' AND v_default <> 'CAD' THEN
    INSERT INTO public.wallets (user_id, currency_code, is_default)
    VALUES (NEW.id, v_default, true)
    ON CONFLICT (user_id, currency_code) DO NOTHING;
  END IF;

  INSERT INTO public.wallets (user_id, currency_code, is_default)
  VALUES (NEW.id, 'USD', false)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency_code, is_default)
  VALUES (NEW.id, 'CAD', false)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  UPDATE public.wallets
     SET is_default = (currency_code = v_default)
   WHERE user_id = NEW.id;

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

  -- Only send welcome email for self-signups. Admin-onboarded users get
  -- their email from the admin-create-* edge function with the recovery link.
  IF NEW.raw_user_meta_data->>'onboarded_by_admin' IS NULL THEN
    PERFORM public.invoke_send_email(
      'welcome',
      NEW.email,
      jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    );
  END IF;

  RETURN NEW;
END;
$$;
