
-- =========================================================
-- ADYEN INTEGRATION
-- =========================================================

-- 1. adyen_payment_sessions
CREATE TABLE public.adyen_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('wallet_topup','transfer_funding','invoice','admin_link')),
  reference text NOT NULL UNIQUE,
  psp_reference text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL,
  target_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  target_currency varchar(3),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','authorised','settled','refused','refunded','cancelled','error')),
  payment_method text,
  return_url text,
  related_transfer_id uuid,
  related_invoice_id uuid,
  raw_session jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.adyen_payment_sessions TO authenticated;
GRANT ALL ON public.adyen_payment_sessions TO service_role;

ALTER TABLE public.adyen_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own adyen sessions"
  ON public.adyen_payment_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "Users insert own adyen sessions"
  ON public.adyen_payment_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update adyen sessions"
  ON public.adyen_payment_sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_adyen_sessions_updated
  BEFORE UPDATE ON public.adyen_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_adyen_sessions_user ON public.adyen_payment_sessions(user_id);
CREATE INDEX idx_adyen_sessions_psp ON public.adyen_payment_sessions(psp_reference);
CREATE INDEX idx_adyen_sessions_status ON public.adyen_payment_sessions(status);

-- 2. adyen_pay_by_link
CREATE TABLE public.adyen_pay_by_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id text UNIQUE,
  url text,
  short_code text,
  reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('invoice','admin_link','wallet_topup')),
  description text,
  sales_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  customer_email text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','paid','cancelled')),
  psp_reference text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.adyen_pay_by_link TO authenticated;
GRANT ALL ON public.adyen_pay_by_link TO service_role;

ALTER TABLE public.adyen_pay_by_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pay links"
  ON public.adyen_pay_by_link FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "Users create own pay links"
  ON public.adyen_pay_by_link FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Admins update pay links"
  ON public.adyen_pay_by_link FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_adyen_paylink_updated
  BEFORE UPDATE ON public.adyen_pay_by_link
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_adyen_paylink_owner ON public.adyen_pay_by_link(owner_user_id);
CREATE INDEX idx_adyen_paylink_invoice ON public.adyen_pay_by_link(sales_invoice_id);

-- 3. adyen_webhook_events (idempotency log)
CREATE TABLE public.adyen_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text NOT NULL,
  psp_reference text,
  merchant_reference text,
  success boolean,
  hmac_valid boolean NOT NULL DEFAULT false,
  amount_minor bigint,
  currency varchar(3),
  payment_method text,
  raw jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (psp_reference, event_code)
);

GRANT ALL ON public.adyen_webhook_events TO service_role;
GRANT SELECT ON public.adyen_webhook_events TO authenticated;

ALTER TABLE public.adyen_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view adyen webhooks"
  ON public.adyen_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE INDEX idx_adyen_webhooks_psp ON public.adyen_webhook_events(psp_reference);
CREATE INDEX idx_adyen_webhooks_merchant_ref ON public.adyen_webhook_events(merchant_reference);

-- 4. Chart of accounts: Adyen settlement clearing per currency
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
SELECT '1108', 'Adyen Settlement Clearing - ' || c.code, 'asset', c.code, true
FROM public.currencies c
WHERE c.code IN ('USD','CAD','EUR','GBP')
ON CONFLICT DO NOTHING;
