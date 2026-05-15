CREATE TABLE IF NOT EXISTS public.paysafe_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  event_id TEXT,
  account_id TEXT,
  merchant_ref_num TEXT,
  payment_handle_token TEXT,
  payment_id TEXT,
  status TEXT,
  amount NUMERIC,
  currency_code TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_merchant_ref ON public.paysafe_webhook_logs(merchant_ref_num);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_payment_id ON public.paysafe_webhook_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_event_type ON public.paysafe_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_paysafe_webhook_logs_created_at ON public.paysafe_webhook_logs(created_at DESC);

ALTER TABLE public.paysafe_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view paysafe webhook logs"
ON public.paysafe_webhook_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));