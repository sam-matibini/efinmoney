-- Schema-only migration for AI-enabled bank transaction rules & posting

-- 1) Transaction rules table
CREATE TABLE IF NOT EXISTS public.transaction_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_type TEXT NOT NULL DEFAULT 'contains',
  match_field TEXT NOT NULL DEFAULT 'description',
  match_value TEXT NOT NULL,
  category TEXT,
  debit_account_id UUID REFERENCES public.ledger_accounts(id),
  credit_account_id UUID REFERENCES public.ledger_accounts(id),
  auto_post BOOLEAN NOT NULL DEFAULT false,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_confidence NUMERIC(5,4),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT transaction_rules_match_type_chk CHECK (match_type IN ('contains', 'starts_with', 'ends_with', 'regex', 'exact')),
  CONSTRAINT transaction_rules_match_field_chk CHECK (match_field IN ('description', 'reference'))
);

ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_transaction_rules_updated_at ON public.transaction_rules;
CREATE TRIGGER update_transaction_rules_updated_at
BEFORE UPDATE ON public.transaction_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Policies for transaction_rules
CREATE POLICY "Transaction rules readable by staff"
ON public.transaction_rules
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
  OR public.has_role(auth.uid(), 'compliance'::app_role)
);

CREATE POLICY "Transaction rules manageable by finance"
ON public.transaction_rules
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_transaction_rules_active_priority
ON public.transaction_rules (is_active, priority);

-- 2) Extend bank_transactions for categorization/posting
ALTER TABLE public.bank_transactions 
  ADD COLUMN IF NOT EXISTS is_categorized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_posted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES public.transaction_rules(id),
  ADD COLUMN IF NOT EXISTS debit_account_id UUID REFERENCES public.ledger_accounts(id),
  ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES public.ledger_accounts(id),
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS journal_id UUID,
  ADD COLUMN IF NOT EXISTS categorized_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE;

-- Allow finance/admin to update bank_transactions
CREATE POLICY "Finance can update bank transactions"
ON public.bank_transactions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'finance'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_categorized_posted
ON public.bank_transactions (is_categorized, is_posted);