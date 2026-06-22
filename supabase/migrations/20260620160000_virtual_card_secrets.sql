-- Encrypted PAN/CVV for wallet-issued virtual cards (revealed only after transaction PIN).

CREATE TABLE IF NOT EXISTS public.card_secrets (
  card_id uuid PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  pan_encrypted text NOT NULL,
  cvv_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.card_secrets ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: only service-role edge functions may read/write.

GRANT ALL ON public.card_secrets TO service_role;

CREATE INDEX IF NOT EXISTS idx_card_secrets_card ON public.card_secrets(card_id);
