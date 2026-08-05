-- Online-learning upgrade for the staff training module (#25) + RPAA program areas.
-- Adds learner-facing content (study materials, quiz, duration), per-staff
-- assignments with expected completion dates, and self-service RLS so any
-- signed-in staff member can take their assigned training.
-- Idempotent + safe to re-run.

-- ---------------------------------------------------------------------
-- 1. Course content columns
-- ---------------------------------------------------------------------
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS study_materials  jsonb   NOT NULL DEFAULT '[]'::jsonb, -- [{title, body}]
  ADD COLUMN IF NOT EXISTS quiz             jsonb   NOT NULL DEFAULT '[]'::jsonb, -- [{question, options[], answer}]
  ADD COLUMN IF NOT EXISTS estimated_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS program_area     text;                                  -- RPAA program grouping

-- ---------------------------------------------------------------------
-- 2. Per-staff assignments (drives completion rate + expected due dates)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_assignments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id                uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'assigned',   -- assigned, in_progress, completed
  assigned_at              timestamptz NOT NULL DEFAULT now(),
  expected_completion_date date,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, course_id)
);

CREATE INDEX IF NOT EXISTS training_assignments_staff_idx
  ON public.training_assignments (staff_id);
CREATE INDEX IF NOT EXISTS training_assignments_course_idx
  ON public.training_assignments (course_id);

ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;

-- Compliance staff: full access to assignments.
DO $$ BEGIN
  BEGIN
    CREATE POLICY "compliance_all_training_assignments" ON public.training_assignments
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'finance'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'finance'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

GRANT ALL ON public.training_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.training_assignments TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Self-service policies so a learner can take their own training
-- ---------------------------------------------------------------------
-- Read published course catalogue (content) for signed-in staff.
DO $$ BEGIN
  BEGIN
    CREATE POLICY "staff_read_training_courses" ON public.training_courses
      FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- A learner sees and updates their own assignments.
DO $$ BEGIN
  BEGIN
    CREATE POLICY "self_read_training_assignments" ON public.training_assignments
      FOR SELECT TO authenticated USING (staff_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "self_update_training_assignments" ON public.training_assignments
      FOR UPDATE TO authenticated USING (staff_id = auth.uid()) WITH CHECK (staff_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- A learner reads their own records and logs their own completions.
DO $$ BEGIN
  BEGIN
    CREATE POLICY "self_read_training_records" ON public.training_records
      FOR SELECT TO authenticated USING (staff_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "self_insert_training_records" ON public.training_records
      FOR INSERT TO authenticated WITH CHECK (staff_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ---------------------------------------------------------------------
-- 4. Seed the RPAA program curriculum (idempotent by course_name)
-- ---------------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, frequency_months, is_mandatory, pass_mark, estimated_minutes, description, study_materials, quiz)
VALUES
  (
    'RPAA Compliance Gap Analysis',
    'compliance', 'RPAA Compliance Gap Analysis', 12, true, 80, 30,
    'How we identify deficiencies against the Retail Payment Activities Act (RPAA) and close them.',
    '[
      {"title":"What a gap analysis is","body":"A structured review that maps each RPAA requirement to our current controls, then rates each as met, partial, or missing. The output is a remediation plan with owners and due dates."},
      {"title":"Scope under the RPAA","body":"Covers the operational risk & incident-response framework, safeguarding of end-user funds, registration, record-keeping and reporting. Every retail payment activity we perform must trace to a documented control."},
      {"title":"Your role","body":"When you spot a process without a documented control or evidence, raise it as a gap in the compliance register rather than working around it."}
    ]'::jsonb,
    '[
      {"question":"What is the primary output of an RPAA gap analysis?","options":["A marketing plan","A remediation plan with owners and due dates","A new product roadmap","A staff bonus schedule"],"answer":1},
      {"question":"Which is IN scope for the RPAA?","options":["Safeguarding of end-user funds","Office catering","Brand colours","Social media tone"],"answer":0},
      {"question":"You find a process with no documented control. You should:","options":["Ignore it","Work around it quietly","Raise it as a gap in the compliance register","Delete the process"],"answer":2}
    ]'::jsonb
  ),
  (
    'Bank of Canada Registration & Reporting',
    'compliance', 'Bank of Canada Registration & Reporting', 12, true, 80, 30,
    'Our registration as a Payment Service Provider (PSP) with the Bank of Canada and the ongoing reporting obligations.',
    '[
      {"title":"Why we register","body":"Under the RPAA, PSPs performing retail payment activities must register with the Bank of Canada before operating and keep their registration information current."},
      {"title":"Ongoing reporting","body":"We file an annual report and must notify the Bank of Canada of significant changes, incidents that affect end users, and changes to safeguarding arrangements within the required timelines."},
      {"title":"Keeping data accurate","body":"Registration details (services, safeguarding, third parties) must be updated when they change. Stale filings are a compliance breach."}
    ]'::jsonb,
    '[
      {"question":"When must a PSP register with the Bank of Canada?","options":["After its first year","Before performing retail payment activities","Only if audited","Never"],"answer":1},
      {"question":"Which must be reported to the Bank of Canada?","options":["Incidents affecting end users","Weekly team lunches","Marketing spend","Office moves with no service impact"],"answer":0},
      {"question":"Registration information should be:","options":["Filed once and forgotten","Kept current as things change","Shared publicly on social media","Only updated every 5 years"],"answer":1}
    ]'::jsonb
  ),
  (
    'RPAA Role-Based Employee Training',
    'compliance', 'RPAA Employee Training', 12, true, 80, 25,
    'Why training is tailored to your role and the specific risks you handle.',
    '[
      {"title":"Role-based training","body":"Obligations differ by role. Front-line staff focus on customer risk signals; operations on safeguarding and reconciliation; leadership on governance and reporting."},
      {"title":"Risk-based focus","body":"Training emphasises the risks most relevant to your work so effort goes where the exposure is greatest, and is refreshed at least annually."},
      {"title":"Evidence","body":"Completion, score and date are recorded to evidence to regulators that staff are trained and competent."}
    ]'::jsonb,
    '[
      {"question":"Why is training role-based?","options":["To make it longer","Because obligations and risks differ by role","To reduce salaries","It is not role-based"],"answer":1},
      {"question":"How often is mandatory training refreshed at minimum?","options":["Every 5 years","Never","At least annually","Only on hire"],"answer":2},
      {"question":"What is recorded to evidence competence?","options":["Completion, score and date","Only your name","Nothing","Your manager''s opinion"],"answer":0}
    ]'::jsonb
  ),
  (
    'RPAA Policies & Procedures',
    'compliance', 'Company RPAA Policies & Procedures', 12, true, 80, 25,
    'Our company-specific RPAA policies and how to follow the procedures that implement them.',
    '[
      {"title":"Policy vs procedure","body":"A policy states what we require and why; a procedure is the step-by-step of how staff meet it. Both are version-controlled and reviewed."},
      {"title":"Operational risk management","body":"The RPAA requires a documented framework covering people, process, technology and third parties, plus an incident-response plan that is tested."},
      {"title":"Following the current version","body":"Always use the approved, current version of a procedure. If a procedure is unclear or unworkable, escalate to Compliance rather than improvising."}
    ]'::jsonb,
    '[
      {"question":"What is the difference between a policy and a procedure?","options":["They are identical","Policy = what/why, procedure = step-by-step how","Procedure = optional","Policy = only for managers"],"answer":1},
      {"question":"The RPAA operational-risk framework must cover:","options":["Only technology","People, process, technology and third parties","Only staff","Only vendors"],"answer":1},
      {"question":"A procedure is unclear. You should:","options":["Improvise your own way","Escalate to Compliance","Skip the step","Ask a customer"],"answer":1}
    ]'::jsonb
  ),
  (
    'AML & Transaction Monitoring Controls',
    'aml', 'AML & Transaction Monitoring Controls', 12, true, 80, 30,
    'The AML controls and transaction-monitoring rules that detect and escalate suspicious activity.',
    '[
      {"title":"Why we monitor","body":"Transaction monitoring detects patterns such as structuring, velocity spikes and high-risk geographies so we can review and, where warranted, report them."},
      {"title":"Alerts and escalation","body":"Monitoring rules generate alerts. Each alert must be reviewed and dispositioned (cleared, escalated or reported); nothing is left open indefinitely."},
      {"title":"Reporting suspicion","body":"Genuine suspicion is escalated for a Suspicious Transaction Report (STR). You never tip off the customer that a report may be filed."}
    ]'::jsonb,
    '[
      {"question":"What does transaction monitoring detect?","options":["Customer birthdays","Structuring, velocity spikes, high-risk geographies","Marketing performance","Server uptime"],"answer":1},
      {"question":"What happens to a monitoring alert?","options":["It is ignored","It is reviewed and dispositioned","It is deleted immediately","It auto-closes after a week"],"answer":1},
      {"question":"When you suspect money laundering you must NOT:","options":["Escalate for an STR","Document your reasoning","Tip off the customer","Follow the procedure"],"answer":2}
    ]'::jsonb
  ),
  (
    'Vendor Management & Data Security',
    'data_privacy', 'Vendor Management & Data Security', 24, true, 75, 25,
    'Managing third-party providers and meeting our data-security obligations.',
    '[
      {"title":"Third-party risk","body":"The RPAA holds us accountable for risks introduced by third parties. Vendors handling payments or end-user data must be assessed, contracted and monitored."},
      {"title":"Data security basics","body":"Protect end-user data with least-privilege access, strong authentication and encryption. Report suspected data incidents immediately."},
      {"title":"Ongoing oversight","body":"Vendor due diligence is not one-off: reassess periodically and when a vendor''s service or risk profile changes."}
    ]'::jsonb,
    '[
      {"question":"Who is accountable for third-party risk under the RPAA?","options":["Only the vendor","We remain accountable","Nobody","The regulator"],"answer":1},
      {"question":"A core data-security principle is:","options":["Share all access widely","Least-privilege access","Disable encryption","Reuse one password"],"answer":1},
      {"question":"Vendor due diligence should be:","options":["One-off at signing","Periodic and event-driven","Never done","Done only after a breach"],"answer":1}
    ]'::jsonb
  ),
  (
    'Financial Crime & Safeguarding Audits',
    'compliance', 'Financial Crime & Safeguarding Audits', 12, true, 80, 25,
    'How financial-crime and safeguarding audits work and your part in them.',
    '[
      {"title":"Safeguarding of funds","body":"End-user funds must be held safely and be identifiable and available to users. Safeguarding audits verify the arrangements and reconciliation controls work."},
      {"title":"Financial-crime audit","body":"Independent testing checks that AML, sanctions, monitoring and reporting controls operate as designed and that findings are remediated."},
      {"title":"Your part","body":"Keep accurate records and evidence. Auditors rely on the trail you create; missing or altered records are themselves a finding."}
    ]'::jsonb,
    '[
      {"question":"What do safeguarding audits verify?","options":["Marketing reach","That end-user funds are safe, identifiable and available","Staff seating","Office rent"],"answer":1},
      {"question":"A financial-crime audit is:","options":["A sales review","Independent testing of AML/sanctions/monitoring controls","A customer survey","An IT upgrade"],"answer":1},
      {"question":"Altered or missing records are:","options":["Fine if minor","Themselves an audit finding","Encouraged","Nobody''s concern"],"answer":1}
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
