-- CAD wallet top-up via Nomba international USD checkout (cross-currency credit)

ALTER TABLE public.nomba_pay_transactions
  ADD COLUMN IF NOT EXISTS credit_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS credit_currency varchar(3),
  ADD COLUMN IF NOT EXISTS checkout_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS checkout_currency varchar(3),
  ADD COLUMN IF NOT EXISTS platform_fee numeric(18, 2),
  ADD COLUMN IF NOT EXISTS fx_rate numeric(18, 6);

COMMENT ON COLUMN public.nomba_pay_transactions.credit_amount IS 'Amount credited to target wallet (may differ from Nomba checkout amount for CAD-via-USD)';
COMMENT ON COLUMN public.nomba_pay_transactions.checkout_amount IS 'Amount charged on Nomba hosted checkout';
