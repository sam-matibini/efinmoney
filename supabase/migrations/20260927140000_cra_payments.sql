-- CRA tax payments on behalf of customers (company-originated bill pay, "Pattern A").
-- Customer funds leave the CAD wallet into Pending Transfers (2200); ops remits via
-- corporate online-banking bill pay to CRA with the customer's identifiers, then records
-- the bank confirmation. Rows are written only by the cra-payment edge function.

CREATE TABLE IF NOT EXISTS public.cra_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  reference text NOT NULL UNIQUE,
  taxpayer_type text NOT NULL CHECK (taxpayer_type IN ('individual', 'business')),
  taxpayer_name text NOT NULL,
  sin text,
  business_number text,
  program_account text,
  payment_type text NOT NULL,
  period text NOT NULL,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency varchar(10) NOT NULL DEFAULT 'CAD',
  fee numeric(20,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'remitted', 'confirmed', 'refunded', 'cancelled')),
  bank_confirmation text,
  remitted_at timestamptz,
  remitted_by uuid,
  confirmed_at timestamptz,
  refunded_at timestamptz,
  failure_reason text,
  ops_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cra_payments_identifier_chk CHECK (
    (taxpayer_type = 'individual' AND sin ~ '^\d{9}$' AND business_number IS NULL)
    OR (taxpayer_type = 'business' AND business_number ~ '^\d{9}$' AND program_account ~ '^R[CPT]\d{4}$' AND sin IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cra_payments_user ON public.cra_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cra_payments_status ON public.cra_payments(status, created_at);

ALTER TABLE public.cra_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own CRA payments" ON public.cra_payments;
CREATE POLICY "Users view own CRA payments" ON public.cra_payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));

DROP TRIGGER IF EXISTS update_cra_payments_updated_at ON public.cra_payments;
CREATE TRIGGER update_cra_payments_updated_at BEFORE UPDATE ON public.cra_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.cra_payments TO authenticated;
GRANT ALL ON public.cra_payments TO service_role;
