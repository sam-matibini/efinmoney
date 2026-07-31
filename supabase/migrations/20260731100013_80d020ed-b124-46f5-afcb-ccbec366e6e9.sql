CREATE TABLE public.account_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  description text,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.account_activity TO authenticated;
GRANT ALL ON public.account_activity TO service_role;

ALTER TABLE public.account_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
  ON public.account_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff can view all activity"
  ON public.account_activity FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'support') OR
    public.has_role(auth.uid(), 'compliance') OR
    public.is_admin_user(auth.uid())
  );

CREATE POLICY "Users can log their own activity"
  ON public.account_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_account_activity_user ON public.account_activity (user_id, created_at DESC);
CREATE INDEX idx_customer_communications_user ON public.customer_communications (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_account_activity(
  p_user_id uuid, p_event_type text, p_description text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.account_activity (user_id, event_type, description, actor_type, actor_id, metadata)
  VALUES (
    p_user_id, p_event_type, p_description,
    CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN auth.uid() = p_user_id THEN 'user'
      ELSE 'staff'
    END,
    auth.uid(), COALESCE(p_metadata, '{}'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.tg_profiles_account_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    PERFORM public.log_account_activity(NEW.user_id, 'kyc_status_changed',
      format('KYC status changed from %s to %s', COALESCE(OLD.kyc_status::text,'none'), COALESCE(NEW.kyc_status::text,'none')),
      jsonb_build_object('from', OLD.kyc_status, 'to', NEW.kyc_status));
  END IF;
  IF NEW.kyc_tier IS DISTINCT FROM OLD.kyc_tier THEN
    PERFORM public.log_account_activity(NEW.user_id, 'kyc_tier_changed',
      format('Tier changed from %s to %s', COALESCE(OLD.kyc_tier::text,'none'), COALESCE(NEW.kyc_tier::text,'none')),
      jsonb_build_object('from', OLD.kyc_tier, 'to', NEW.kyc_tier));
  END IF;
  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    PERFORM public.log_account_activity(NEW.user_id, 'account_status_changed',
      format('Account status changed from %s to %s', COALESCE(OLD.account_status::text,'none'), COALESCE(NEW.account_status::text,'none')),
      jsonb_build_object('from', OLD.account_status, 'to', NEW.account_status));
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    PERFORM public.log_account_activity(NEW.user_id, 'email_changed',
      format('Email changed from %s to %s', COALESCE(OLD.email,'—'), COALESCE(NEW.email,'—')), '{}'::jsonb);
  END IF;
  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
    PERFORM public.log_account_activity(NEW.user_id, 'phone_changed', 'Phone number updated', '{}'::jsonb);
  END IF;
  IF (NEW.street_address, NEW.city, NEW.state_province, NEW.postal_code, NEW.address_country)
     IS DISTINCT FROM (OLD.street_address, OLD.city, OLD.state_province, OLD.postal_code, OLD.address_country) THEN
    PERFORM public.log_account_activity(NEW.user_id, 'address_changed', 'Residential address updated', '{}'::jsonb);
  END IF;
  IF NEW.transaction_pin_hash IS DISTINCT FROM OLD.transaction_pin_hash THEN
    PERFORM public.log_account_activity(NEW.user_id, 'transaction_pin_changed', 'Transaction PIN set or changed', '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER profiles_account_activity
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_account_activity();

CREATE OR REPLACE FUNCTION public.tg_wallets_account_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_account_activity(NEW.user_id, 'wallet_created',
      format('%s wallet created', NEW.currency_code), jsonb_build_object('currency', NEW.currency_code));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_account_activity(NEW.user_id, 'wallet_status_changed',
      format('%s wallet %s', NEW.currency_code, NEW.status),
      jsonb_build_object('currency', NEW.currency_code, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER wallets_account_activity
  AFTER INSERT OR UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_wallets_account_activity();

CREATE OR REPLACE FUNCTION public.tg_cards_account_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_account_activity(NEW.user_id, 'card_issued',
      'Card issued', jsonb_build_object('card_id', NEW.id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_account_activity(NEW.user_id, 'card_status_changed',
      format('Card status changed to %s', NEW.status),
      jsonb_build_object('card_id', NEW.id, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cards_account_activity
  AFTER INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.tg_cards_account_activity();