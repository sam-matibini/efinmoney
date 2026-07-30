-- handle_new_user() must persist full_name from raw_user_meta_data into
-- profiles. The signup form always collects first + last name and passes
-- them via supabase.auth.signUp options.data, which lands in
-- auth.users.raw_user_meta_data ->> 'full_name'. But the trigger only
-- inserted user_id, email, account_status, and kyc_framework_version
-- into public.profiles — leaving full_name NULL. The client-side
-- fallback that updated profiles after signUp only runs when there is
-- an active session, which the standard "confirm your email" flow does
-- not have, so the column stayed empty and the admin users list showed
-- "No name".

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_full_name  text;
  v_first_name text;
  v_last_name  text;
BEGIN
  IF COALESCE((NEW.raw_user_meta_data->>'is_staff')::boolean, false) THEN
    RETURN NEW;
  END IF;

  v_full_name  := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name',  '')), '');
  v_first_name := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  v_last_name  := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'last_name',  '')), '');

  INSERT INTO public.profiles (
    user_id, email, full_name, account_status, kyc_framework_version
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, 'pending_verification', 2
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

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
    jsonb_build_object(
      'name',       COALESCE(v_full_name,  ''),
      'first_name', COALESCE(v_first_name, ''),
      'last_name',  COALESCE(v_last_name,  '')
    )
  );

  RETURN NEW;
END;
$$;
