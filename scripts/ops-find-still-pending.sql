SELECT id, status, source_amount, source_currency, target_currency, recipient_name, created_at, updated_at
FROM public.transfers
WHERE id = '1b1e616b-5baf-459a-baa9-5f76a5c959bb'
   OR (
     status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing')
     AND created_at > now() - interval '7 days'
   )
ORDER BY created_at DESC
LIMIT 50;
