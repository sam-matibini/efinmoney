CREATE TABLE IF NOT EXISTS public.partner_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Primary',
  purpose text NOT NULL DEFAULT 'funding',
  account_holder text,
  bank_name text,
  account_number text,
  routing_code text,
  iban text,
  swift_bic text,
  currency_code text,
  country text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_bank_accounts_partner_idx ON public.partner_bank_accounts(partner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_bank_accounts TO authenticated;
GRANT ALL ON public.partner_bank_accounts TO service_role;

ALTER TABLE public.partner_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and super admins manage partner bank accounts"
ON public.partner_bank_accounts
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'finance'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'finance'));

CREATE TRIGGER partner_bank_accounts_set_updated_at
BEFORE UPDATE ON public.partner_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();