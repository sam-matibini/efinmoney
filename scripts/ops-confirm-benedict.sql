SELECT id, status, source_amount, source_currency, target_currency, recipient_name, created_at
FROM public.transfers
WHERE (recipient_name ILIKE '%Ukwenya%' OR recipient_name ILIKE '%BENEDICT%')
  AND created_at > now() - interval '14 days'
ORDER BY created_at DESC
LIMIT 20;
