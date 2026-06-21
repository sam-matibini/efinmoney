-- =========================================================
-- ELICATE INBOUND CHARGES (mobile-money top-ups)
-- =========================================================
-- Mirrors the shape of adyen_payment_sessions so the webhook can look
-- up the originating charge by reference / psp_reference and credit the
-- target wallet on charge.successful events.

CREATE TABLE public.elicate_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  psp_reference text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL,
  target_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  phone text NOT NULL,
  network text NOT NULL,
  customer_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awaiting_approval','completed','failed','cancelled','expired')),
  failure_reason text,
  redirect_url text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.elicate_charges TO authenticated;
GRANT ALL ON public.elicate_charges TO service_role;

ALTER TABLE public.elicate_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own elicate charges"
  ON public.elicate_charges FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "Users insert own elicate charges"
  ON public.elicate_charges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update elicate charges"
  ON public.elicate_charges FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_elicate_charges_updated
  BEFORE UPDATE ON public.elicate_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_elicate_charges_user ON public.elicate_charges(user_id);
CREATE INDEX idx_elicate_charges_psp ON public.elicate_charges(psp_reference);
CREATE INDEX idx_elicate_charges_status ON public.elicate_charges(status);
CREATE INDEX idx_elicate_charges_wallet ON public.elicate_charges(target_wallet_id);
