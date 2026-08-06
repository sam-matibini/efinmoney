-- Phase 0: Training system schema upgrade.
-- (1) Add attachments, resources, role_requirement columns to training_courses.
-- (2) Normalize program_area to classification enum values on all existing courses.
-- Idempotent + safe to re-run.
--
-- Storage bucket (cannot be created via SQL):
--   supabase storage create training-materials --private
--   OR: Supabase dashboard → Storage → New bucket → "training-materials" → Private

-- ---------------------------------------------------------------------
-- 1. New columns on training_courses
-- ---------------------------------------------------------------------
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name, path, size_label, mime}]
  ADD COLUMN IF NOT EXISTS resources       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label, url, type}]
  ADD COLUMN IF NOT EXISTS role_requirement text;                                 -- "All staff" | "Compliance + Finance" | etc.

-- ---------------------------------------------------------------------
-- 2. Normalize program_area to classification enum values
-- ---------------------------------------------------------------------

-- FINTRAC mandatory
UPDATE public.training_courses
  SET program_area    = 'fintrac_mandatory',
      role_requirement = COALESCE(role_requirement, 'All staff')
  WHERE course_name IN (
    'AML/ATF Fundamentals',
    'Suspicious Transaction Reporting'
  );

-- FINTRAC elective
UPDATE public.training_courses
  SET program_area    = 'fintrac_elective',
      role_requirement = COALESCE(role_requirement, 'All staff')
  WHERE course_name IN (
    'Sanctions & Screening',
    'Privacy & PIPEDA',
    'Fraud & Security Awareness',
    'AML Course',
    'Compliance Course'
  );

-- BoC RPAA mandatory
UPDATE public.training_courses
  SET program_area    = 'boc_rpaa_mandatory',
      role_requirement = COALESCE(role_requirement, 'All staff')
  WHERE course_name IN (
    'RPAA Compliance Gap Analysis',
    'Bank of Canada Registration & Reporting',
    'RPAA Role-Based Employee Training',
    'RPAA Policies & Procedures',
    'AML & Transaction Monitoring Controls',
    'Vendor Management & Data Security',
    'Financial Crime & Safeguarding Audits'
  );

-- Any remaining courses with a stale free-text program_area that don't
-- match the enum values yet — fall back to 'fintrac_mandatory' so the
-- learner tab never shows a blank or unrecognised program area.
UPDATE public.training_courses
  SET program_area = 'fintrac_mandatory'
  WHERE program_area IS NOT NULL
    AND program_area NOT IN (
      'fintrac_mandatory',
      'fintrac_elective',
      'boc_rpaa_mandatory',
      'boc_rpaa_elective',
      'consulting'
    );

-- ---------------------------------------------------------------------
-- 3. Seed resources JSONB for the 12 existing courses (official links)
-- ---------------------------------------------------------------------

-- AML/ATF Fundamentals
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC Compliance Program Guide (Guide 4)","url":"https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng","type":"Official Guidance"},
    {"label":"MSB ML/TF Indicators","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng","type":"Official Guidance"},
    {"label":"FINTRAC Supervisory Framework","url":"https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/cpf/cpf-eng.asp","type":"Official Guidance"},
    {"label":"PCMLTFA (full text)","url":"https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html","type":"Statute"}
  ]'::jsonb
  WHERE course_name = 'AML/ATF Fundamentals';

-- Suspicious Transaction Reporting
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC STR Guidance","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/str-dod/str-dod-eng","type":"Official Guidance"},
    {"label":"MSB ML/TF Indicators","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng","type":"Official Guidance"},
    {"label":"FINTRAC AMP Policy","url":"https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/cpf/cpf-eng.asp","type":"Official Guidance"},
    {"label":"F2R Web Reporting Portal","url":"https://www6.fintrac-canafe.gc.ca/f2r/public/fintrac-web-reporting-f2r/user-agreement/","type":"Portal"}
  ]'::jsonb
  WHERE course_name = 'Suspicious Transaction Reporting';

-- Sanctions & Screening
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC Guide 5 – Reporting Listed Persons","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/Guide5/5-eng","type":"Official Guidance"},
    {"label":"FINTRAC Methods to Report","url":"https://www.fintrac-canafe.gc.ca/reporting-declaration/1-eng","type":"Official Guidance"},
    {"label":"Global Affairs Canada – Consolidated Sanctions List","url":"https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'Sanctions & Screening';

-- Privacy & PIPEDA
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC Record-Keeping for MSBs","url":"https://fintrac-canafe.gc.ca/guidance-directives/recordkeeping-document/record/msb-eng","type":"Official Guidance"},
    {"label":"OPC – PIPEDA Overview","url":"https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'Privacy & PIPEDA';

-- Fraud & Security Awareness
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC MSB ML/TF Indicators","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng","type":"Official Guidance"},
    {"label":"FINTRAC Virtual Currency Indicators","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/vc_mltf-eng","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'Fraud & Security Awareness';

-- Bank of Canada Registration & Reporting (R-01)
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – Information for PSPs (hub)","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/","type":"Official Guidance"},
    {"label":"BoC – Criteria for Registering PSPs","url":"https://www.bankofcanada.ca/2024/10/criteria-for-registering-payment-service-providers/","type":"Official Guidance"},
    {"label":"BoC – PSP Registry (public)","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/","type":"Portal"},
    {"label":"PSP Connect – Registration Portal","url":"https://rps.bankofcanada.ca","type":"Portal"},
    {"label":"BoC – FAQs on Retail Payments Supervision","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/frequently-asked-questions-about-retail-payments-supervision/","type":"Official Guidance"},
    {"label":"RPAA (full text)","url":"https://laws-lois.justice.gc.ca/eng/acts/R-8.4/","type":"Statute"}
  ]'::jsonb
  WHERE course_name = 'Bank of Canada Registration & Reporting';

-- RPAA Compliance Gap Analysis
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – Supervisory Policies and Guidelines","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/retail-payments-supervision-supervisory-policies-and-guidelines/","type":"Official Guidance"},
    {"label":"BoC – Supervisory Framework","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/supervisory-framework-registration/","type":"Official Guidance"},
    {"label":"BoC – FAQs on Retail Payments Supervision","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/frequently-asked-questions-about-retail-payments-supervision/","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'RPAA Compliance Gap Analysis';

-- RPAA Policies & Procedures
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – ORM & Incident Response Guideline (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2024/02/operational-risk-and-incident-response.pdf","type":"Official Guidance"},
    {"label":"BoC – ORM At a Glance (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2025/02/Operational-risk-and-incident-response-At-a-glance.pdf","type":"Official Guidance"},
    {"label":"BoC – Supervisory Policies and Guidelines","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/retail-payments-supervision-supervisory-policies-and-guidelines/","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'RPAA Policies & Procedures';

-- AML & Transaction Monitoring Controls
UPDATE public.training_courses
  SET resources = '[
    {"label":"FINTRAC Compliance Program Guide (Guide 4)","url":"https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng","type":"Official Guidance"},
    {"label":"FINTRAC Risk-Based Approach Guidance","url":"https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng","type":"Official Guidance"},
    {"label":"FINTRAC MSB ML/TF Indicators","url":"https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng","type":"Official Guidance"},
    {"label":"F2R Web Reporting Portal","url":"https://www6.fintrac-canafe.gc.ca/f2r/public/fintrac-web-reporting-f2r/user-agreement/","type":"Portal"}
  ]'::jsonb
  WHERE course_name = 'AML & Transaction Monitoring Controls';

-- Vendor Management & Data Security
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – Safeguarding of End-User Funds Guideline (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2024/02/safeguarding-end-user-funds.pdf","type":"Official Guidance"},
    {"label":"BoC – Safeguarding At a Glance (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2025/02/Safeguarding-of-end-user-funds-At-a-glance.pdf","type":"Official Guidance"},
    {"label":"BoC – FAQs on Retail Payments Supervision","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/frequently-asked-questions-about-retail-payments-supervision/","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'Vendor Management & Data Security';

-- Financial Crime & Safeguarding Audits
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – Safeguarding of End-User Funds Guideline (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2024/02/safeguarding-end-user-funds.pdf","type":"Official Guidance"},
    {"label":"BoC – Incident Notification Guideline (PDF)","url":"https://www.bankofcanada.ca/wp-content/uploads/2024/02/Incident-notification.pdf","type":"Official Guidance"},
    {"label":"FINTRAC Supervisory Framework","url":"https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/cpf/cpf-eng.asp","type":"Official Guidance"},
    {"label":"FINTRAC AMP Policy","url":"https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/ampo-pasgr/ampo-pasgr-eng","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'Financial Crime & Safeguarding Audits';

-- RPAA Role-Based Employee Training
UPDATE public.training_courses
  SET resources = '[
    {"label":"BoC – Information for PSPs (hub)","url":"https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/","type":"Official Guidance"},
    {"label":"FINTRAC Compliance Program Guide (Guide 4) – Element 4: Training","url":"https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng","type":"Official Guidance"}
  ]'::jsonb
  WHERE course_name = 'RPAA Role-Based Employee Training';
