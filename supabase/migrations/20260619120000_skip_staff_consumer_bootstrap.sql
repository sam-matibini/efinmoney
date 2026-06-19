-- Staff invites (admin-invite-staff) create auth.users with is_staff metadata.
-- They must NOT receive the consumer welcome email or get default wallets/KYC rows.

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
