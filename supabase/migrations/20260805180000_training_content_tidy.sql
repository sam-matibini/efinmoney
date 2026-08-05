-- Tidy the training catalogue so every mandatory course has real learning content.
-- (1) Add study materials + quizzes to the 5 legacy FINTRAC courses that had none.
-- (2) Demote the two generic placeholder courses to optional so they drop out of
--     the mandatory curriculum / learner view (kept, not deleted, to preserve any
--     existing completion records).
-- Idempotent + safe to re-run.

-- ---------------------------------------------------------------------
-- 1. Content for the legacy FINTRAC courses
-- ---------------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, frequency_months, is_mandatory, pass_mark, estimated_minutes, description, study_materials, quiz)
VALUES
  (
    'AML/ATF Fundamentals',
    'aml', 'AML/ATF Fundamentals', 12, true, 80, 30,
    'The essentials of anti-money-laundering and anti-terrorist-financing and our core obligations.',
    '[
      {"title":"What money laundering is","body":"The process of disguising the proceeds of crime as legitimate funds, classically through placement, layering and integration. Terrorist financing may use legitimate or illicit funds to support terrorism."},
      {"title":"Our obligations","body":"As a FINTRAC-regulated business we must identify customers, keep records, monitor activity, and report suspicious and prescribed transactions."},
      {"title":"Red flags","body":"Reluctance to provide ID, transactions with no economic purpose, structuring just below thresholds, and third parties directing the activity."}
    ]'::jsonb,
    '[
      {"question":"The three classic stages of money laundering are:","options":["Placement, layering, integration","Buy, hold, sell","Draft, review, file","Open, freeze, close"],"answer":0},
      {"question":"Terrorist financing can involve:","options":["Only illicit funds","Legitimate or illicit funds","Only cash","Only crypto"],"answer":1},
      {"question":"Which is a money-laundering red flag?","options":["Providing ID promptly","Transactions with no economic purpose","Using a registered account","Paying fees on time"],"answer":1}
    ]'::jsonb
  ),
  (
    'Sanctions & Screening',
    'sanctions', 'Sanctions & Screening', 12, true, 80, 30,
    'Why and how we screen customers and transactions against sanctions lists.',
    '[
      {"title":"Why we screen","body":"We must not deal with sanctioned individuals, entities or jurisdictions. Screening customers and transactions against sanctions lists is a legal requirement."},
      {"title":"Lists we use","body":"UN, OFAC and Canadian (SEMA / Global Affairs Canada) lists among others. They change frequently and are refreshed regularly."},
      {"title":"On a match","body":"Do not proceed. Freeze or hold the activity and escalate to Compliance for review and, where required, reporting. Never tip off the customer."}
    ]'::jsonb,
    '[
      {"question":"Screening checks customers/transactions against:","options":["Marketing lists","Sanctions lists","Credit scores","Social media"],"answer":1},
      {"question":"Canadian sanctions are administered via:","options":["SEMA / Global Affairs Canada","The city council","A credit bureau","No one"],"answer":0},
      {"question":"On a confirmed sanctions match you should:","options":["Proceed quietly","Freeze and escalate to Compliance","Tell the customer to hurry","Ignore it"],"answer":1}
    ]'::jsonb
  ),
  (
    'Suspicious Transaction Reporting',
    'compliance', 'Suspicious Transaction Reporting', 12, true, 80, 30,
    'When and how to report suspicious transactions to FINTRAC.',
    '[
      {"title":"What an STR is","body":"A report filed with FINTRAC when there are reasonable grounds to suspect a transaction is related to money laundering or terrorist financing."},
      {"title":"Reasonable grounds to suspect","body":"A lower threshold than proof, based on facts, context and indicators. You do not need to be certain to report."},
      {"title":"No tipping off","body":"It is an offence to disclose that an STR has been or will be made in a way that could prejudice an investigation."}
    ]'::jsonb,
    '[
      {"question":"An STR is filed with:","options":["FINTRAC","The customer","A bank branch","No one"],"answer":0},
      {"question":"The threshold to report is:","options":["Absolute proof","Reasonable grounds to suspect","A court order","A hunch you keep to yourself"],"answer":1},
      {"question":"Telling a customer an STR was filed is:","options":["Encouraged","An offence (tipping off)","Required","Optional"],"answer":1}
    ]'::jsonb
  ),
  (
    'Privacy & PIPEDA',
    'data_privacy', 'Privacy & PIPEDA', 24, true, 70, 25,
    'How we handle personal information under Canada''s PIPEDA.',
    '[
      {"title":"PIPEDA basics","body":"Canada''s federal private-sector privacy law. We must obtain consent, limit collection to what is needed, and protect personal information."},
      {"title":"Handling personal data","body":"Collect only what you need, use it only for the stated purpose, and retain it no longer than necessary."},
      {"title":"Breaches","body":"A privacy breach involving a real risk of significant harm must be reported to the Privacy Commissioner and to affected individuals."}
    ]'::jsonb,
    '[
      {"question":"PIPEDA governs:","options":["Traffic rules","Private-sector handling of personal information","Tax filing","Trademarks"],"answer":1},
      {"question":"Personal data should be collected:","options":["As much as possible","Only what is needed for the stated purpose","Forever","For resale"],"answer":1},
      {"question":"A breach with real risk of significant harm must be reported to:","options":["No one","The Privacy Commissioner and affected individuals","Only your manager","Social media"],"answer":1}
    ]'::jsonb
  ),
  (
    'Fraud & Security Awareness',
    'fraud', 'Fraud & Security Awareness', 12, true, 70, 25,
    'Recognising fraud and protecting accounts and customers.',
    '[
      {"title":"Common fraud types","body":"Phishing, account takeover, social engineering, and authorised push-payment scams targeting both customers and staff."},
      {"title":"Protecting accounts","body":"Use strong, unique passwords and MFA, verify requests through known channels, and never share credentials."},
      {"title":"If you suspect fraud","body":"Report immediately through the internal channel; never act on a suspicious payment instruction without independent verification."}
    ]'::jsonb,
    '[
      {"question":"Phishing is:","options":["A fishing sport","Tricking people into revealing credentials or acting","A payment type","A report"],"answer":1},
      {"question":"A key account protection is:","options":["Sharing passwords","MFA and strong, unique passwords","Reusing one password","Disabling locks"],"answer":1},
      {"question":"A suspicious payment instruction should be:","options":["Actioned quickly","Verified through known channels first","Ignored forever","Forwarded to customers"],"answer":1}
    ]'::jsonb
  )
ON CONFLICT (course_name) DO UPDATE
  SET category          = EXCLUDED.category,
      program_area      = EXCLUDED.program_area,
      frequency_months  = EXCLUDED.frequency_months,
      is_mandatory      = true,
      pass_mark         = EXCLUDED.pass_mark,
      estimated_minutes = EXCLUDED.estimated_minutes,
      description       = EXCLUDED.description,
      study_materials   = EXCLUDED.study_materials,
      quiz              = EXCLUDED.quiz;

-- ---------------------------------------------------------------------
-- 2. Demote the generic placeholder courses (kept for record integrity)
-- ---------------------------------------------------------------------
UPDATE public.training_courses
  SET is_mandatory = false
  WHERE course_name IN ('AML Course', 'Compliance Course');
