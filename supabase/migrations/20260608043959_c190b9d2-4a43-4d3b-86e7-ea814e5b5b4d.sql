
-- =========== plaid_items: hide access_token from authenticated ===========
REVOKE SELECT ON public.plaid_items FROM authenticated;
GRANT SELECT (id, user_id, item_id, institution_id, institution_name, status, created_at, updated_at)
  ON public.plaid_items TO authenticated;

-- =========== transfers: hide interac_security_answer ===========
REVOKE SELECT ON public.transfers FROM authenticated;
GRANT SELECT (
  id, sender_id, sender_wallet_id, recipient_name, recipient_phone, recipient_account,
  recipient_country, transfer_type, payout_method, source_currency, target_currency,
  source_amount, target_amount, exchange_rate, fee_amount, status, provider_reference,
  failure_reason, completed_at, created_at, updated_at, recipient_bank_code, recipient_bank_name,
  interac_security_question, paysafe_payment_id, funding_source, stripe_payout_id,
  provider_charge_id, stellar_tx_hash, circle_transfer_id, circle_quote_id, circle_status,
  circle_idempotency_key, circle_payload
) ON public.transfers TO authenticated;

-- =========== kyc_verifications: hide internal_notes ===========
REVOKE SELECT ON public.kyc_verifications FROM authenticated;
GRANT SELECT (
  id, user_id, verification_status, current_step, id_document_type, id_document_url,
  id_document_country, id_verification_status, id_rejection_reason, address_document_type,
  address_document_url, address_verification_status, address_rejection_reason, selfie_url,
  liveness_check_status, persona_inquiry_id, submitted_at, reviewed_at, reviewed_by,
  created_at, updated_at, escalated, escalated_at, persona_inquiry_status,
  persona_verification_data, persona_session_token, persona_decision, persona_decision_reason,
  interac_session_id, interac_sub, interac_verification_status, interac_claims,
  interac_completed_at, verification_provider, source_of_funds_url, source_of_funds_type,
  source_of_funds_status, address_proof_url, tier_target
) ON public.kyc_verifications TO authenticated;

-- =========== profiles: hide stellar_seed_encrypted, stripe_customer_id, aml_status, risk_score ===========
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, user_id, email, full_name, phone_number, country_code, kyc_status, kyc_tier,
  default_currency, avatar_url, created_at, updated_at, account_number, account_status,
  kyc_completed_at, street_address, city, state_province, postal_code, address_country,
  stellar_public_key, efin_tag, kyc_framework_version, aml_last_screened_at
) ON public.profiles TO authenticated;

-- =========== crossmint_yellowcard_transfers: hide raw provider payloads ===========
REVOKE SELECT ON public.crossmint_yellowcard_transfers FROM authenticated;
GRANT SELECT (
  id, user_id, source_currency, source_amount, destination_currency, destination_amount,
  destination_country, recipient_name, recipient_bank_name, recipient_bank_code,
  recipient_account_number, recipient_phone, recipient_email, fx_rate, fee_amount, status,
  crossmint_order_id, crossmint_checkout_url, stellar_tx_hash, yellowcard_payment_id,
  failure_reason, created_at, updated_at, smart_wallet_address, payout_tx_hash
) ON public.crossmint_yellowcard_transfers TO authenticated;
