-- Partner registry
INSERT INTO public.payment_partners
  (id, code, name, direction, country, api_status, integration_status, settlement_currency,
   supported_currencies, supported_countries, payment_methods, payin_function_slug, payout_function_slug,
   settlement_time, reliability_score, compliance_risk, priority, status, liquidity_stale_minutes, statement_mapping)
VALUES
  ('a4745461-d30f-47be-8fd6-33ebe7dbfa8e','flutterwave','Flutterwave','both','NG','active','active','USD','{NGN,GHS,KES,UGX,TZS,ZMW}','{NG,GH,KE,UG,TZ,ZM}','{bank,mobile_money,card}','flw-initialize-payment','flutterwave-payout','minutes',97,'low',20,'active',720,'{}'),
  ('0aac92e9-7e14-4089-96c7-0fe44d32995c','nomba','Nomba','both','NG','active','active','NGN','{NGN}','{NG}','{bank,card}','nomba-collection','nomba-payout','minutes',96,'low',10,'active',720,'{}'),
  ('c2d67a7a-15e1-4f3b-9bd2-da08633ee583','pawapay','PawaPay','payout','GB','active','active','USD','{GHS,KES,UGX,TZS,ZMW,RWF,XOF,XAF}','{GH,KE,UG,TZ,ZM,RW,CI,SN,CM}','{mobile_money}',NULL,'pawapay-payout','minutes',96,'low',20,'active',720,'{}'),
  ('15b3f7bb-0873-46a4-8043-c045f380490c','fincra','Fincra','both','NG','active','active','USD','{NGN,GHS,KES,ZMW,UGX,TZS,RWF,CAD}','{NG,GH,KE,ZM,UG,TZ,RW,CA}','{bank,mobile_money,card,interac}','fincra-initialize-checkout','fincra-payout','minutes',93,'low',40,'active',720,'{}'),
  ('631b5a53-9a23-4fd6-a5f0-91c54a4f6734','stellar','Stellar SEP-31','payout','US','active','active','USDC','{USDC,NGN,KES,GHS}','{NG,KE,GH}','{bank,crypto}',NULL,'stellar-sep31-payout','minutes',92,'medium',50,'active',720,'{}'),
  ('fd6757f5-9ccb-40f8-8ca5-42198ee51053','swychr','Swychr','both','CM','active','active','XAF','{XAF,XOF,KES,UGX}','{CM,CI,SN,KE,UG}','{mobile_money,card}','swychr-collection','swychr-payout','minutes',90,'medium',60,'active',720,'{}'),
  ('8e65bdec-5d5e-47d5-acdb-ef67650d6beb','circle_cpn','Circle CPN','payout','US','active','active','USDC','{USDC,COP,MXN,BRL,PHP,GHS,NGN,KES}','{CO,MX,BR,PH,GH,NG,KE}','{bank,crypto}',NULL,'initiate-cpn-payout','hours',95,'low',40,'active',720,'{}'),
  (gen_random_uuid(),'paysafe','Paysafe','both','CA','active','active','CAD','{CAD,USD}','{CA,US}','{bank,card,eft}',NULL,'paysafe-payout','hours',94,'low',30,'active',720,'{}'),
  (gen_random_uuid(),'stripe','Stripe','both','US','active','active','USD','{USD,CAD,EUR,GBP}','{US,CA,GB,DE,FR}','{card,bank}','stripe-payment-intent','stripe-payout','days',98,'low',15,'active',720,'{}'),
  (gen_random_uuid(),'wise','Wise','payin','GB','active','active','CAD','{CAD,USD,EUR,GBP}','{CA,US,GB,DE}','{interac,eft,bank}','wise-topup-intent',NULL,'hours',96,'low',10,'active',720,'{}'),
  (gen_random_uuid(),'square','Square','payin','US','active','active','USD','{USD,CAD,EUR,GBP}','{US,CA,GB}','{card}','square-create-checkout',NULL,'days',97,'low',15,'active',720,'{}'),
  (gen_random_uuid(),'adyen','Adyen','payin','NL','active','active','EUR','{EUR,USD,CAD,GBP}','{NL,US,CA,GB}','{card}','adyen-create-session',NULL,'days',96,'low',25,'active',720,'{}'),
  (gen_random_uuid(),'paytota','Paytota','both','KE','active','active','USD','{KES,UGX,TZS}','{KE,UG,TZ}','{mobile_money,bank}','paytota-collection','paytota-payout','minutes',88,'medium',70,'active',720,'{}')
ON CONFLICT (code) DO NOTHING;

-- Corridor map
INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, v.direction::public.partner_direction, v.src_country, v.dst_country, v.src_ccy, v.dst_ccy, v.method, true, v.mins, false
FROM (VALUES
  ('flutterwave','payout','CA','NG','CAD','NGN','bank',10),
  ('flutterwave','payout','CA','GH','CAD','GHS','mobile_money',10),
  ('flutterwave','payout','CA','KE','CAD','KES','mobile_money',10),
  ('flutterwave','payout','CA','UG','CAD','UGX','mobile_money',10),
  ('flutterwave','payout','CA','TZ','CAD','TZS','mobile_money',10),
  ('flutterwave','payout','CA','ZM','CAD','ZMW','mobile_money',10),
  ('flutterwave','payin','NG','CA','NGN','CAD','card',15),
  ('nomba','payout','CA','NG','CAD','NGN','bank',3),
  ('nomba','payin','NG','NG','NGN','NGN','card',5),
  ('pawapay','payout','CA','GH','CAD','GHS','mobile_money',5),
  ('pawapay','payout','CA','KE','CAD','KES','mobile_money',5),
  ('pawapay','payout','CA','UG','CAD','UGX','mobile_money',5),
  ('pawapay','payout','CA','TZ','CAD','TZS','mobile_money',5),
  ('pawapay','payout','CA','ZM','CAD','ZMW','mobile_money',5),
  ('pawapay','payout','CA','RW','CAD','RWF','mobile_money',5),
  ('fincra','payout','CA','NG','CAD','NGN','bank',10),
  ('fincra','payout','CA','GH','CAD','GHS','mobile_money',10),
  ('fincra','payout','CA','KE','CAD','KES','mobile_money',10),
  ('fincra','payout','CA','ZM','CAD','ZMW','mobile_money',10),
  ('fincra','payout','CA','UG','CAD','UGX','mobile_money',10),
  ('fincra','payout','CA','TZ','CAD','TZS','mobile_money',10),
  ('fincra','payin','CA','CA','CAD','CAD','interac',30),
  ('fincra','payin','NG','CA','NGN','CAD','card',15),
  ('stellar','payout','CA','NG','CAD','NGN','bank',15),
  ('stellar','payout','CA','KE','CAD','KES','bank',15),
  ('stellar','payout','CA','GH','CAD','GHS','bank',15),
  ('swychr','payout','CA','CM','CAD','XAF','mobile_money',15),
  ('swychr','payout','CA','CI','CAD','XOF','mobile_money',15),
  ('swychr','payout','CA','SN','CAD','XOF','mobile_money',15),
  ('swychr','payout','CA','KE','CAD','KES','mobile_money',15),
  ('swychr','payout','CA','UG','CAD','UGX','mobile_money',15),
  ('swychr','payin','CM','CA','XAF','CAD','mobile_money',20),
  ('circle_cpn','payout','CA','CO','CAD','COP','bank',120),
  ('circle_cpn','payout','CA','MX','CAD','MXN','bank',120),
  ('circle_cpn','payout','CA','BR','CAD','BRL','bank',120),
  ('circle_cpn','payout','CA','PH','CAD','PHP','bank',120),
  ('circle_cpn','payout','CA','GH','CAD','GHS','bank',120),
  ('circle_cpn','payout','CA','NG','CAD','NGN','bank',120),
  ('paysafe','payout','CA','CA','CAD','CAD','eft',720),
  ('paysafe','payin','CA','CA','CAD','CAD','card',20),
  ('stripe','payin','CA','CA','CAD','CAD','card',20),
  ('stripe','payin','US','US','USD','USD','card',20),
  ('stripe','payin','GB','GB','GBP','GBP','card',20),
  ('stripe','payout','CA','US','CAD','USD','bank',1440),
  ('wise','payin','CA','CA','CAD','CAD','interac',30),
  ('wise','payin','CA','CA','CAD','CAD','eft',720),
  ('square','payin','CA','CA','CAD','CAD','card',20),
  ('square','payin','US','US','USD','USD','card',20),
  ('adyen','payin','CA','CA','CAD','CAD','card',20),
  ('adyen','payin','NL','NL','EUR','EUR','card',20),
  ('paytota','payout','CA','KE','CAD','KES','mobile_money',10),
  ('paytota','payout','CA','UG','CAD','UGX','mobile_money',10),
  ('paytota','payin','KE','CA','KES','CAD','mobile_money',20)
) AS v(code, direction, src_country, dst_country, src_ccy, dst_ccy, method, mins)
JOIN public.payment_partners p ON p.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_corridors c
  WHERE c.partner_id = p.id
    AND c.direction = v.direction::public.partner_direction
    AND coalesce(c.source_currency,'') = v.src_ccy
    AND coalesce(c.dest_currency,'') = v.dst_ccy
    AND coalesce(c.dest_country,'') = v.dst_country
    AND coalesce(c.payment_method,'') = v.method
);

NOTIFY pgrst, 'reload schema';