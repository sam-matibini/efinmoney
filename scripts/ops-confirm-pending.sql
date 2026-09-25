SELECT status, count(*) AS n
FROM public.transfers
WHERE status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing')
  AND created_at > now() - interval '90 days'
GROUP BY status;
