-- Fix: virtual-card-ops 500 — "permission denied for table card_secrets" (42501)
-- Run once in Supabase Dashboard → SQL Editor (production dkdnwumllibwdlqbjkwy)

GRANT ALL ON public.card_secrets TO service_role;
GRANT ALL ON public.virtual_card_transfers TO service_role;

NOTIFY pgrst, 'reload schema';
