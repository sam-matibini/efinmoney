-- Payment Link: store the recipient's email so the claim link can be auto-sent
-- via Resend (send-email, type 'payment_link') at creation time.
ALTER TABLE public.payment_link_payouts
  ADD COLUMN IF NOT EXISTS recipient_email text;

-- Ledger accounts required for escrow (21xx + 2199) and release (1108) already
-- exist for USD/CAD/EUR/GBP from earlier migrations, so international payment
-- links can escrow/release without further COA seeding.
