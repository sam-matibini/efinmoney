-- Elicate Pay payment links (ZMW MoMo collect) — parallel to Stripe CAD payment links.

CREATE TABLE public.elicate_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  elicate_link_id text,
  slug text,
  url text,
  name text NOT NULL,
  link_type text NOT NULL DEFAULT 'fixed'
    CHECK (link_type IN ('fixed', 'flexible')),
  amount numeric(18, 2),
  min_amount numeric(18, 2) DEFAULT 0,
  description text,
  redirect_url text,
  active boolean NOT NULL DEFAULT true,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.elicate_payment_links TO authenticated;
GRANT ALL ON public.elicate_payment_links TO service_role;

ALTER TABLE public.elicate_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own elicate payment links"
  ON public.elicate_payment_links FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Users insert own elicate payment links"
  ON public.elicate_payment_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own elicate payment links"
  ON public.elicate_payment_links FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_elicate_payment_links_updated
  BEFORE UPDATE ON public.elicate_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_elicate_payment_links_user ON public.elicate_payment_links(user_id);
CREATE INDEX idx_elicate_payment_links_slug ON public.elicate_payment_links(slug);
CREATE INDEX idx_elicate_payment_links_wallet ON public.elicate_payment_links(wallet_id);
