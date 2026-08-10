ALTER TABLE public.payment_partners ADD COLUMN IF NOT EXISTS partner_ref text;

CREATE SEQUENCE IF NOT EXISTS public.payment_partner_ref_seq;

CREATE OR REPLACE FUNCTION public.assign_payment_partner_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.partner_ref IS NULL OR btrim(NEW.partner_ref) = '' THEN
    NEW.partner_ref := 'EFN' || lpad(nextval('public.payment_partner_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payment_partner_ref ON public.payment_partners;
CREATE TRIGGER set_payment_partner_ref
BEFORE INSERT ON public.payment_partners
FOR EACH ROW EXECUTE FUNCTION public.assign_payment_partner_ref();

UPDATE public.payment_partners SET partner_ref = v.ref
FROM (VALUES
  ('fincra','EFN0001'),
  ('flutterwave','EFN0002'),
  ('nomba','EFN0003'),
  ('pawapay','EFN0004'),
  ('paysafe','EFN0005'),
  ('paytota','EFN0006'),
  ('square','EFN0007'),
  ('stellar','EFN0008'),
  ('stripe','EFN0009'),
  ('swychr','EFN0010'),
  ('wise','EFN0011'),
  ('adyen','EFN0012'),
  ('circle_cpn','EFN0013')
) AS v(code, ref)
WHERE public.payment_partners.code = v.code;

-- any partner not covered above gets the next available ref
UPDATE public.payment_partners p
SET partner_ref = 'EFN' || lpad((13 + t.rn)::text, 4, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, name) AS rn
  FROM public.payment_partners
  WHERE partner_ref IS NULL
) t
WHERE p.id = t.id;

SELECT setval('public.payment_partner_ref_seq',
  GREATEST(13, COALESCE((SELECT MAX(NULLIF(regexp_replace(partner_ref, '\D', '', 'g'), '')::int) FROM public.payment_partners), 13)));

CREATE UNIQUE INDEX IF NOT EXISTS payment_partners_partner_ref_key ON public.payment_partners (partner_ref);