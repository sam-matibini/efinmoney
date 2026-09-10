-- Customer wallet liability for USD stables so fiat↔USDC/USDT swaps can post.
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
SELECT v.code, v.name, 'liability'::public.account_type, v.currency, true, true
FROM (VALUES
  ('2117', 'Customer Wallet Liability - USDC', 'USDC'),
  ('2118', 'Customer Wallet Liability - USDT', 'USDT')
) AS v(code, name, currency)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ledger_accounts la
  WHERE la.code = v.code OR (la.currency_code = v.currency AND la.name ILIKE 'Customer Wallet Liability%')
);
