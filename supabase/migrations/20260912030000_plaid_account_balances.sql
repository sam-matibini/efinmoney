-- Live Plaid balances on linked bank accounts (Bank tab / transfer decisioning).
-- Plaid /accounts/balance/get is a live extract; values are cached here for the UI.

ALTER TABLE public.plaid_accounts
  ADD COLUMN IF NOT EXISTS available_balance numeric(20, 2),
  ADD COLUMN IF NOT EXISTS current_balance numeric(20, 2),
  ADD COLUMN IF NOT EXISTS balances_iso_currency text,
  ADD COLUMN IF NOT EXISTS balances_updated_at timestamptz;

COMMENT ON COLUMN public.plaid_accounts.available_balance IS
  'Plaid available balance (spendable). Null when the institution does not report it.';
COMMENT ON COLUMN public.plaid_accounts.current_balance IS
  'Plaid current / ledger balance.';
COMMENT ON COLUMN public.plaid_accounts.balances_iso_currency IS
  'ISO currency of the last Plaid balance extract.';
COMMENT ON COLUMN public.plaid_accounts.balances_updated_at IS
  'When available_balance / current_balance were last written from Plaid.';

CREATE INDEX IF NOT EXISTS idx_plaid_accounts_balances_updated
  ON public.plaid_accounts (user_id, balances_updated_at);
