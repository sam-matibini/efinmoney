-- =====================================================================
-- eFinMoney — Training: mandatory vs elective tiering
-- Run once in your Supabase SQL Editor. Idempotent, safe to re-run.
-- =====================================================================
-- Model:
--   requirement_type = 'all_staff'   -> Tier 1, everyone, no exceptions
--   requirement_type = 'role_based'  -> Tier 2, auto-assigned by staff role
--   requirement_type = 'elective'    -> Tier 3, self-enrol, never overdue
--   applies_to_roles                 -> admin_users.role values for Tier 2
--   onboarding_due_days              -> days from staff activation to first pass
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS requirement_type    text NOT NULL DEFAULT 'elective',
  ADD COLUMN IF NOT EXISTS applies_to_roles    text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS onboarding_due_days integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_requirement_type_chk'
  ) THEN
    ALTER TABLE public.training_courses
      ADD CONSTRAINT training_courses_requirement_type_chk
      CHECK (requirement_type IN ('all_staff', 'role_based', 'elective'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS training_courses_requirement_type_idx
  ON public.training_courses (requirement_type);

-- ---------------------------------------------------------------------
-- 2. Baseline: everything starts as elective, then we promote.
-- ---------------------------------------------------------------------
UPDATE public.training_courses
   SET requirement_type    = 'elective',
       applies_to_roles    = '{}'::text[],
       onboarding_due_days = NULL,
       is_mandatory        = false;

-- ---------------------------------------------------------------------
-- 3. Tier 1 — mandatory for ALL staff (30-day onboarding clock)
-- ---------------------------------------------------------------------
UPDATE public.training_courses
   SET requirement_type    = 'all_staff',
       is_mandatory        = true,
       onboarding_due_days = 30,
       frequency_months    = 12,
       role_requirement    = 'All staff'
 WHERE course_name IN (
   'AML/ATF Fundamentals',
   'Suspicious Transaction Reporting',
   'Sanctions Compliance & Terrorist Property Reporting',
   'Fraud Awareness & Internal Controls'
 );

UPDATE public.training_courses
   SET requirement_type    = 'all_staff',
       is_mandatory        = true,
       onboarding_due_days = 30,
       frequency_months    = 24,
       role_requirement    = 'All staff'
 WHERE course_name IN (
   'Privacy, PIPEDA & Data Stewardship',
   'Compliance Culture & Ethics'
 );

-- ---------------------------------------------------------------------
-- 4. Tier 2 — mandatory by role (60-day onboarding clock)
--    Roles match public.admin_users.role
-- ---------------------------------------------------------------------

-- Compliance + super admin
UPDATE public.training_courses
   SET requirement_type    = 'role_based',
       is_mandatory        = true,
       onboarding_due_days = 60,
       frequency_months    = 12,
       applies_to_roles    = ARRAY['compliance_officer','super_admin'],
       role_requirement    = 'Compliance and super admin'
 WHERE course_name IN (
   'RPAA Policies & Procedures',
   'AML & Transaction Monitoring Controls',
   'Financial Crime & Safeguarding Audits',
   'RPAA Role-Based Employee Training'
 );

-- Finance / treasury
UPDATE public.training_courses
   SET requirement_type    = 'role_based',
       is_mandatory        = true,
       onboarding_due_days = 60,
       frequency_months    = 12,
       applies_to_roles    = ARRAY['finance_officer','super_admin'],
       role_requirement    = 'Finance and super admin'
 WHERE course_name IN (
   'Safeguarding Program Design (RPAA)',
   'RPAA Compliance Gap Analysis',
   'PSP Annual Reporting & Ongoing Disclosure Obligations'
 );

-- Support / operations
UPDATE public.training_courses
   SET requirement_type    = 'role_based',
       is_mandatory        = true,
       onboarding_due_days = 60,
       frequency_months    = 12,
       applies_to_roles    = ARRAY['support_agent','compliance_officer','super_admin'],
       role_requirement    = 'Support, compliance and super admin'
 WHERE course_name IN (
   'Advanced ML/TF Typologies for Remittances'
 );

-- Technology / vendor oversight
UPDATE public.training_courses
   SET requirement_type    = 'role_based',
       is_mandatory        = true,
       onboarding_due_days = 60,
       frequency_months    = 24,
       applies_to_roles    = ARRAY['super_admin','compliance_officer','support_agent'],
       role_requirement    = 'Staff with vendor or system access'
 WHERE course_name IN (
   'Vendor Management & Data Security'
 );

-- Senior management / directors
UPDATE public.training_courses
   SET requirement_type    = 'role_based',
       is_mandatory        = true,
       onboarding_due_days = 60,
       frequency_months    = 24,
       applies_to_roles    = ARRAY['super_admin'],
       role_requirement    = 'Senior management'
 WHERE course_name IN (
   'Bank of Canada Registration & Reporting'
 );

-- ---------------------------------------------------------------------
-- 5. Retire duplicate legacy courses (kept for history, hidden from catalogue)
-- ---------------------------------------------------------------------
UPDATE public.training_courses
   SET requirement_type = 'elective',
       is_mandatory     = false,
       role_requirement = 'Retired — superseded'
 WHERE course_name IN ('AML Course', 'Compliance Course');

-- ---------------------------------------------------------------------
-- 6. Sanity check
-- ---------------------------------------------------------------------
-- SELECT requirement_type, count(*) FROM public.training_courses GROUP BY 1;
-- SELECT course_name, requirement_type, applies_to_roles, frequency_months,
--        onboarding_due_days
--   FROM public.training_courses ORDER BY requirement_type, course_name;
