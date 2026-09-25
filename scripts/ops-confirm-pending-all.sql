SELECT status, count(*) AS n
FROM public.transfers
WHERE status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing')
GROUP BY status;
