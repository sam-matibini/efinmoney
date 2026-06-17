-- Staff onboarding (part 1/2): add the new finance_officer admin role.
-- ALTER TYPE ... ADD VALUE must be committed before the value can be used,
-- so this lives in its own migration ahead of the main staff-onboarding one.

ALTER TYPE public.admin_user_role ADD VALUE IF NOT EXISTS 'finance_officer';
