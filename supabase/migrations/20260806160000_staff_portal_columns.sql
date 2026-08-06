-- Phase 2: Staff self-service portal
-- Adds address, emergency_contact, next_of_kin to admin_users.
-- Adds RLS for staff to self-manage their own bank accounts.

-- ─── admin_users: new jsonb profile columns ──────────────────────────────────
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS address          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS next_of_kin       jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── staff_bank_accounts: self-service policies ───────────────────────────────
-- The existing "Admins manage bank accounts" FOR ALL policy covers super_admin/finance.
-- These additional policies let active staff add and remove their own accounts.

DROP POLICY IF EXISTS "Staff insert own bank accounts"          ON public.staff_bank_accounts;
DROP POLICY IF EXISTS "Staff delete own unverified accounts"    ON public.staff_bank_accounts;

CREATE POLICY "Staff insert own bank accounts"
  ON public.staff_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
    )
  );

-- Staff may only delete their own accounts that have not yet been verified.
-- Verified accounts are referenced by payroll; only finance can remove those.
CREATE POLICY "Staff delete own unverified accounts"
  ON public.staff_bank_accounts FOR DELETE TO authenticated
  USING (
    staff_id = auth.uid()
    AND verified = false
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
    )
  );
