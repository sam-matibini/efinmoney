-- Disable all pricing rule corridors (fall back to global pricing_config for all transfers)
UPDATE public.pricing_rules SET enabled = false;
