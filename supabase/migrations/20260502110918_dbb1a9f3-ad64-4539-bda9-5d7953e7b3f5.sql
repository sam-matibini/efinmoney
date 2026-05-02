DO $$
DECLARE
  v_uid uuid := '93975b48-5237-4200-82a4-53b2abb5ad8b';
BEGIN
  DELETE FROM public.ledger_entries WHERE wallet_id IN (SELECT id FROM public.wallets WHERE user_id = v_uid);
  DELETE FROM public.ledger_entries WHERE created_by = v_uid;
  DELETE FROM public.crypto_trades WHERE user_id = v_uid;
  DELETE FROM public.fx_transactions WHERE user_id = v_uid;
  DELETE FROM public.compliance_alerts WHERE user_id = v_uid;
  DELETE FROM public.transfers WHERE sender_id = v_uid;
  DELETE FROM public.cards WHERE user_id = v_uid;
  DELETE FROM public.linked_funding_sources WHERE user_id = v_uid;
  DELETE FROM public.notifications WHERE user_id = v_uid;
  DELETE FROM public.customer_portal_access WHERE user_id = v_uid;
  DELETE FROM public.wallets WHERE user_id = v_uid;
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  DELETE FROM public.profiles WHERE user_id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
END $$;