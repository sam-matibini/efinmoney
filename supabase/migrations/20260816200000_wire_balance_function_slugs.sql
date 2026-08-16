-- Wire each payment partner to its balance-fetch edge function.
-- partner-liquidity-refresh calls POST /functions/v1/{balance_function_slug}
-- with { action: "balances", partner_code } and expects { balances: [...] }.

UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-wise'         WHERE code = 'wise';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-nomba'        WHERE code = 'nomba';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-fincra'       WHERE code = 'fincra';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-flutterwave'  WHERE code = 'flutterwave';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-stripe'       WHERE code = 'stripe';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-pawapay'      WHERE code = 'pawapay';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-adyen'        WHERE code = 'adyen';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-square'       WHERE code = 'square';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-paysafe'      WHERE code = 'paysafe';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-paytota'      WHERE code = 'paytota';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-swychr'       WHERE code = 'swychr';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-circle'       WHERE code = 'circle_cpn';
UPDATE public.payment_partners SET balance_function_slug = 'partner-balance-stellar'      WHERE code = 'stellar';
