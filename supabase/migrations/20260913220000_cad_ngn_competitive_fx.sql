-- CAD→NGN customer FX was stacking two markups:
--   1. fx_rates.effective_rate already includes a 0.50% refresh spread
--   2. corridor_rate_cards.efin_fx_spread was 1.50%–1.75% on that already-marked rate
-- Result: ~2% below mid-market, worse than CBN official and Sendwave.
-- Quote from fx_rates.rate (mid) and keep NGN customer spread at 0.60%–0.70%.

UPDATE public.corridor_rate_cards
SET
  efin_fx_spread = 0.006,
  recommended_position = 'Highly competitive'
WHERE corridor_id = 'CAD_NGN_BANK';

UPDATE public.corridor_rate_cards
SET efin_fx_spread = 0.007
WHERE corridor_id = 'CAD_NGN_WALLET';

UPDATE public.corridor_rate_cards
SET efin_fx_spread = 0.006
WHERE corridor_id = 'WALLET_CAD_NGN';

UPDATE public.efinmoney_pricing
SET fx_margin_bps = 60
WHERE source_currency = 'CAD'
  AND dest_currency = 'NGN'
  AND payment_method = 'bank'
  AND effective_to IS NULL;

UPDATE public.efinmoney_pricing
SET fx_margin_bps = 70
WHERE source_currency = 'CAD'
  AND dest_currency = 'NGN'
  AND payment_method = 'wallet'
  AND effective_to IS NULL;

UPDATE public.efinmoney_pricing
SET fx_margin_bps = 60
WHERE source_currency = 'CAD'
  AND dest_currency = 'NGN'
  AND payment_method = 'fx_swap'
  AND effective_to IS NULL;
