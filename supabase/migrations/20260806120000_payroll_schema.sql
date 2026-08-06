-- Phase 1: Payroll schema
-- Tables: staff_bank_accounts, staff_salaries, payroll_runs, payroll_entries

-- ─── staff_bank_accounts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  bank_name      text NOT NULL,
  account_number text NOT NULL,
  account_name   text NOT NULL,
  routing_code   text,
  currency       text NOT NULL DEFAULT 'NGN',
  is_primary     boolean NOT NULL DEFAULT false,
  verified       boolean NOT NULL DEFAULT false,
  verified_by    uuid REFERENCES public.admin_users(id),
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_bank_accounts_staff_id ON public.staff_bank_accounts(staff_id);

ALTER TABLE public.staff_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own bank accounts"
  ON public.staff_bank_accounts FOR SELECT
  USING (staff_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

CREATE POLICY "Admins manage bank accounts"
  ON public.staff_bank_accounts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_bank_accounts TO authenticated;

CREATE OR REPLACE TRIGGER trg_staff_bank_accounts_updated_at
  BEFORE UPDATE ON public.staff_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── staff_salaries (versioned — new row per change) ────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  base_amount      numeric(15,2) NOT NULL CHECK (base_amount > 0),
  currency         text NOT NULL DEFAULT 'NGN',
  pay_schedule     text NOT NULL DEFAULT 'monthly'
                     CHECK (pay_schedule IN ('monthly', 'biweekly', 'weekly')),
  pay_day          smallint NOT NULL DEFAULT 25 CHECK (pay_day BETWEEN 1 AND 31),
  bank_account_id  uuid REFERENCES public.staff_bank_accounts(id) ON DELETE SET NULL,
  effective_date   date NOT NULL DEFAULT CURRENT_DATE,
  created_by       uuid REFERENCES public.admin_users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_salaries_staff_id ON public.staff_salaries(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_effective ON public.staff_salaries(staff_id, effective_date DESC);

ALTER TABLE public.staff_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own salary"
  ON public.staff_salaries FOR SELECT
  USING (staff_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

CREATE POLICY "Finance admins manage salaries"
  ON public.staff_salaries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

GRANT SELECT, INSERT ON public.staff_salaries TO authenticated;

-- ─── payroll_runs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'approved', 'paid')),
  notes        text,
  total_gross  numeric(15,2),
  total_net    numeric(15,2),
  entry_count  integer,
  run_by       uuid REFERENCES public.admin_users(id),
  approved_by  uuid REFERENCES public.admin_users(id),
  approved_at  timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_period_unique UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON public.payroll_runs(status);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance admins manage payroll runs"
  ON public.payroll_runs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

GRANT SELECT, INSERT, UPDATE ON public.payroll_runs TO authenticated;

CREATE OR REPLACE TRIGGER trg_payroll_runs_updated_at
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── payroll_entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.admin_users(id),
  salary_id       uuid REFERENCES public.staff_salaries(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.staff_bank_accounts(id) ON DELETE SET NULL,
  gross           numeric(15,2) NOT NULL,
  deductions      jsonb NOT NULL DEFAULT '{"tax":0,"pension":0,"other":0}',
  net             numeric(15,2) NOT NULL,
  notes           text,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_run_id   ON public.payroll_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_staff_id ON public.payroll_entries(staff_id);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own entries"
  ON public.payroll_entries FOR SELECT
  USING (staff_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

CREATE POLICY "Finance admins manage entries"
  ON public.payroll_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
    AND au.role IN ('super_admin', 'finance_officer')
  ));

GRANT SELECT, INSERT, UPDATE ON public.payroll_entries TO authenticated;

CREATE OR REPLACE TRIGGER trg_payroll_entries_updated_at
  BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
