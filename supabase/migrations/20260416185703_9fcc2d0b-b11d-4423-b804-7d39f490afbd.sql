-- Pricing configuration (key-value, admin-managed, publicly readable)
CREATE TABLE public.pricing_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing config is publicly readable"
ON public.pricing_config FOR SELECT USING (true);

CREATE POLICY "Admins can manage pricing config"
ON public.pricing_config FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));

-- Seed default transfer pricing
INSERT INTO public.pricing_config (key, value, description) VALUES
  ('transfer_base_fee', 2.99, 'Flat base fee per transfer (in source currency)'),
  ('transfer_card_surcharge', 1.50, 'Additional fee when funding from a credit/debit card');

-- Linked funding sources owned by individual users (banks + cards used for funding)
CREATE TABLE public.linked_funding_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('bank', 'card')),
  display_name TEXT NOT NULL,
  institution TEXT,
  last_four TEXT NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.linked_funding_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funding sources"
ON public.linked_funding_sources FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own funding sources"
ON public.linked_funding_sources FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own funding sources"
ON public.linked_funding_sources FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own funding sources"
ON public.linked_funding_sources FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all funding sources"
ON public.linked_funding_sources FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_linked_funding_sources_user ON public.linked_funding_sources(user_id, is_active);