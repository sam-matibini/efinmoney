-- =====================================================================
-- Developer Onboarding Tab — admin-assisted user and business onboarding
-- Phase 1+2 of 8. See docs/developer-onboarding.md.
--
-- Adds:
--   1. onboarded_by_admin_id, onboarded_via, onboarded_at on profiles
--   2. same three columns on customers (the business table)
--   3. UBO ownership_pct total = 100% safety-net trigger
--   4. admin_orphaned_invitations view for cleanup cron
--   5. handle_new_user: switch welcome -> admin_invitation email template
--      when the user is created via the Developer tab flow
-- =====================================================================

-- 1. profiles: track admin-assisted onboarding source
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_by_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarded_via text
    CHECK (onboarded_via IN ('self', 'admin', 'developer_api')),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarded_by_admin
  ON public.profiles (onboarded_by_admin_id)
  WHERE onboarded_by_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarded_at
  ON public.profiles (onboarded_at DESC)
  WHERE onboarded_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.onboarded_by_admin_id IS
  'admin_users.id of the admin who created this profile via the Developer tab. NULL for self-signup.';
COMMENT ON COLUMN public.profiles.onboarded_via IS
  'How the user was created: self-signup, admin-via-Developer-tab, or future developer_api.';
COMMENT ON COLUMN public.profiles.onboarded_at IS
  'When the user was created. NULL for legacy users created before this migration.';

-- 2. customers: same tracking on the business table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS onboarded_by_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarded_via text
    CHECK (onboarded_via IN ('self', 'admin', 'developer_api')),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_onboarded_by_admin
  ON public.customers (onboarded_by_admin_id)
  WHERE onboarded_by_admin_id IS NOT NULL;

COMMENT ON COLUMN public.customers.onboarded_by_admin_id IS
  'admin_users.id of the admin who created this business via the Developer tab. NULL for self-signup.';
COMMENT ON COLUMN public.customers.onboarded_via IS
  'How the business was created: self-signup, admin-via-Developer-tab, or future developer_api.';
COMMENT ON COLUMN public.customers.onboarded_at IS
  'When the business record was created. NULL for legacy businesses created before this migration.';

-- 3. UBO ownership_pct safety net: total per customer must equal exactly 100
-- Application layer (admin-create-business edge function) is the primary defense;
-- this trigger is a safety net so a buggy API call cannot leave a customer with
-- bad UBO totals. Allows a customer to temporarily have zero UBOs (during draft)
-- but if any UBOs exist, they must sum to exactly 100.
CREATE OR REPLACE FUNCTION public.check_ubo_ownership_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
  v_total numeric(7,2);
  v_count int;
BEGIN
  -- Determine which customer_id to check based on the operation
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  SELECT
    count(*),
    coalesce(sum(ownership_pct), 0)
  INTO v_count, v_total
  FROM public.beneficial_owners
  WHERE customer_id = v_customer_id;

  -- Allow zero UBOs (customer in draft state). Once any UBO exists, total must = 100.
  IF v_count > 0 AND v_total <> 100 THEN
    RAISE EXCEPTION
      'UBO ownership_pct for customer % totals % but must equal exactly 100 (found % owners)',
      v_customer_id, v_total, v_count
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_ubo_ownership_total ON public.beneficial_owners;
CREATE TRIGGER trg_check_ubo_ownership_total
  AFTER INSERT OR UPDATE OR DELETE ON public.beneficial_owners
  FOR EACH ROW EXECUTE FUNCTION public.check_ubo_ownership_total();

-- 4. Orphaned invitations view — accounts created by admin where the user never
-- claimed their invite email within the deadline. Used by the cleanup cron and
-- surfaced as a "Pending claims" badge in the Developer dashboard.
CREATE OR REPLACE VIEW public.admin_orphaned_invitations AS
SELECT
  p.id            AS profile_id,
  p.user_id       AS user_id,
  p.email         AS email,
  p.full_name     AS full_name,
  p.onboarded_by_admin_id,
  p.onboarded_at,
  u.last_sign_in_at,
  extract(day from (now() - p.onboarded_at))::int AS days_since_invite
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE p.onboarded_via = 'admin'
  AND p.onboarded_at IS NOT NULL
  AND u.last_sign_in_at IS NULL
  AND p.onboarded_at < (now() - interval '14 days');

COMMENT ON VIEW public.admin_orphaned_invitations IS
  'Admin-onboarded users who have not signed in within 14 days. Drives the cleanup cron and the dashboard pending-claims badge.';

GRANT SELECT ON public.admin_orphaned_invitations TO authenticated;

-- 5. handle_new_user: switch email template when onboarded via Developer tab.
-- When auth.users.raw_user_meta_data->>'onboarded_by_admin' = 'true', the
-- 'admin_invitation' email template is sent instead of 'welcome'.
-- Body copied from 20260731132000_wallet_default_from_country.sql to keep
-- the latest version in sync; only the email call changes.
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
  v_usd_exists boolean;
  v_cad_exists boolean;
  v_local_exists boolean;
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

  PERFORM public.invoke_send_email(
    CASE WHEN NEW.raw_user_meta_data->>'onboarded_by_admin' = 'true'
         THEN 'admin_invitation'
         ELSE 'welcome'
    END,
    NEW.email,
    jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  );

  RETURN NEW;
END;
$$;
