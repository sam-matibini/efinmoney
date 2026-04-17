CREATE TABLE IF NOT EXISTS public.webhooks_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT,
  external_reference TEXT,
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_provider ON public.webhooks_inbox(provider);
CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_external_ref ON public.webhooks_inbox(external_reference);
CREATE INDEX IF NOT EXISTS idx_webhooks_inbox_transfer ON public.webhooks_inbox(transfer_id);

ALTER TABLE public.webhooks_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view webhook inbox"
ON public.webhooks_inbox FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'finance')
  OR public.has_role(auth.uid(), 'compliance')
  OR public.has_role(auth.uid(), 'support')
);