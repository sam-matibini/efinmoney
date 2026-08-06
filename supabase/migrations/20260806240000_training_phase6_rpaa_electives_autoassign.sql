-- ==============================================================
-- Phase 6: BoC RPAA electives + role-based auto-assignment
--
-- Part A — 2 new elective courses
--   R-E1  PSP Annual Reporting & Ongoing Disclosure  — 7L 10Q
--   R-E2  Consumer-Driven Banking & Evolving Regs    — 7L 10Q
--
-- Part B — Auto-assignment trigger
--   On INSERT into user_roles, enrol the user in all mandatory
--   courses that apply to their role:
--     admin | compliance | finance → fintrac_mandatory + boc_rpaa_mandatory
--     user  | support              → fintrac_mandatory only
--   Due date: 30 calendar days from assignment.
--   Idempotent: ON CONFLICT (staff_id, course_id) DO NOTHING.
-- ==============================================================

-- ---------------------------------------------------------------
-- R-E1  PSP Annual Reporting & Ongoing Disclosure Obligations
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'PSP Annual Reporting & Ongoing Disclosure Obligations',
  'compliance', 'boc_rpaa_elective', false, 24, 40, 70,
  'Compliance and finance staff',
  'Deep dive into the RPAA annual report due March 31 — required content, safeguarding data, incident disclosures, significant change pre-notification, the senior officer attestation, and what the BoC does with the data.',
  $sm_re1$[
    {
      "title": "Structure of the RPAA Annual Report",
      "body": "Every registered PSP must submit an annual report to the Bank of Canada by March 31 each year, covering the preceding calendar year. The annual report is submitted through PSPConnect. It is not a financial statement — it is a compliance attestation document that covers four areas: (1) Safeguarding — confirmation of the eligible accounts used, average and peak end-user fund values held during the year, and confirmation that no commingling occurred. (2) Operational incidents — disclosure of any incidents that were notified to the BoC during the year, their resolution, and any systemic patterns. (3) Significant changes — a summary of any significant changes that were pre-notified during the year and implemented. (4) Attestation — a declaration by a senior officer of the PSP that the information in the report is accurate and complete to the best of their knowledge. Understanding each section ensures the report is filed accurately rather than treated as a bureaucratic checkbox."
    },
    {
      "title": "Safeguarding Data — What to Measure and How",
      "body": "The safeguarding section of the annual report requires specific numerical disclosures. Compliance and finance staff must understand exactly what is being measured: (1) Average daily end-user funds — computed as the sum of all daily closing safeguarding obligation balances across the reporting year, divided by 365 (or 366 for leap years). This figure reflects the typical scale of safeguarding exposure. (2) Peak end-user funds — the highest single-day safeguarding obligation across the year. This reflects worst-case exposure. (3) Eligible accounts — the name of each financial institution and account type used for safeguarding during the year. If accounts were changed during the year, all accounts used must be disclosed with the dates of use. These figures must come from the daily reconciliation ledger — not from year-end bank statements alone. A PSP that has not been performing daily reconciliations will discover at reporting time that the data simply does not exist. This is why daily reconciliation is an operational, not just a regulatory, obligation."
    },
    {
      "title": "Incident Disclosures in the Annual Report",
      "body": "The annual report requires a summary of all operational incidents notified to the BoC during the reporting year. For each notifiable incident: (1) A description of what occurred — at sufficient detail for the BoC to understand the nature and scope. (2) The date of detection and the date of initial notification (to confirm timeliness). (3) The remediation taken — what was done to contain, resolve, and prevent recurrence. (4) Whether the root cause has been addressed. Staff preparing the annual report should compile incident records from the compliance file — every Level 3 incident should have a post-incident review document that can be summarised here. A PSP that experienced zero notifiable incidents during the year still completes this section — they confirm zero incidents rather than leaving it blank. Blank sections look like omissions to examiners."
    },
    {
      "title": "Significant Change Pre-Notification — Deep Dive",
      "body": "A significant change is a material change to the PSP's registered activities, safeguarding arrangements, or business structure that must be notified to the BoC in advance. Examples: commencing a new type of retail payment activity; changing the eligible safeguarding institution; acquiring another PSP; materially changing the ORM framework. The pre-notification process through PSPConnect requires: (1) A description of the proposed change. (2) The planned implementation date. (3) Confirmation that the safeguarding and ORM frameworks will remain compliant after the change. The BoC does not 'approve' the change — it acknowledges receipt and may follow up with questions. The obligation is to notify, not to obtain approval. Critically: the pre-notification must be submitted before implementation, not at the same time or after. Implementing the change and then pre-notifying is itself a violation. The annual report discloses all significant changes notified and implemented during the year — so any unreported changes would appear as a gap."
    },
    {
      "title": "Common Annual Report Errors",
      "body": "Based on BoC guidance and practitioner experience, common errors in RPAA annual reports include: (1) Reporting average or peak safeguarding figures from memory or estimates rather than daily reconciliation records — figures that cannot be substantiated from underlying records will not survive an examination. (2) Omitting accounts that held end-user funds temporarily — even an account that was used for only 2 weeks during the year must be disclosed. (3) Failing to disclose incidents that occurred but were resolved before the BoC was formally notified — the obligation to notify applies regardless of how quickly the issue was fixed. (4) Missing the March 31 deadline because the senior officer review and attestation is left to the last day and there is insufficient time for corrections. (5) The attestation signed by someone who is not actually a senior officer (e.g., a junior compliance analyst signs on behalf of the CCO without proper authority). Begin annual report preparation at least 6 weeks before March 31."
    },
    {
      "title": "The Senior Officer Attestation",
      "body": "The annual report must be attested to by a senior officer of the PSP — defined as someone at a level where they have sufficient authority and accountability for compliance with the RPAA. In practice, this is typically the CEO, CFO, COO, or CCO, depending on the PSP's governance structure. The attestation is a legal declaration that the information in the report is accurate and complete. A senior officer who signs an attestation containing materially inaccurate information — even if prepared by a junior staff member — bears personal accountability. This is why the pre-submission review process is critical: the senior officer must review the figures, the incident disclosures, and the significant change summary before signing. The review should be documented as a formal sign-off meeting with minutes. If errors are discovered after submission, the PSP may submit a corrected report with an explanation — proactively correcting an error is significantly better than having a BoC examiner discover the discrepancy."
    },
    {
      "title": "What the BoC Does with Annual Report Data",
      "body": "The BoC uses annual report data for several purposes, and understanding these uses helps PSPs appreciate why accuracy matters: (1) Risk-based supervision — PSPs with higher fund volumes, more incidents, or more significant changes during the year receive closer supervisory attention. A PSP with $50 million average daily end-user funds is a higher systemic risk than one with $500,000 and will be examined sooner and more thoroughly. (2) Systemic risk monitoring — the aggregate data across all PSPs allows the BoC to assess the systemic risk exposure of the retail payments sector. This is the BoC's primary mandate under the RPAA. (3) Registry updates — the annual report triggers a review of the PSP's registration details for currency. (4) Examination scheduling — the annual report is the primary input to the BoC's examination calendar. PSPs should treat the annual report as an opportunity to present their compliance record accurately, not as an adversarial disclosure. The BoC is more likely to engage collaboratively with a PSP that demonstrates forthright and accurate reporting."
    }
  ]$sm_re1$::jsonb,
  $qz_re1$[
    {
      "question": "The RPAA annual report must be submitted to the Bank of Canada by:",
      "options": ["December 31 of the reporting year", "January 31 of the following year", "March 31 of the following year", "June 30 of the following year"],
      "answer": 2
    },
    {
      "question": "The average daily end-user funds figure reported in the annual report is computed as:",
      "options": ["The balance on December 31 of the reporting year", "The sum of daily closing safeguarding obligation balances divided by 365", "The average of the 12 month-end safeguarding balances", "The peak balance held at any point during the year"],
      "answer": 1
    },
    {
      "question": "If a PSP used two different safeguarding accounts during the year (switching institutions in July), the annual report must:",
      "options": ["Disclose only the account in use on December 31", "Disclose both accounts with the dates of use for each", "Disclose only the account with the higher average balance", "Note the change in the significant changes section only"],
      "answer": 1
    },
    {
      "question": "An incident that was resolved internally without requiring BoC notification must appear in the annual report as:",
      "options": ["Fully disclosed with the same detail as a notifiable incident", "Zero incidents — only notifiable incidents are disclosed", "A footnote only if the impact exceeded $10,000", "Not disclosed — the obligation is to notify in real time, not retrospectively"],
      "answer": 1
    },
    {
      "question": "A PSP changes its safeguarding institution without pre-notifying the BoC, then discloses the change in the annual report. This is:",
      "options": ["Acceptable — the annual report is the correct vehicle for significant change disclosure", "A violation — pre-notification must occur before implementation, not retrospectively via the annual report", "Only a violation if the BoC objects to the new institution", "Permitted for changes made in the first quarter of the reporting year"],
      "answer": 1
    },
    {
      "question": "The most common annual report preparation error is:",
      "options": ["Reporting too many incidents", "Using estimated or remembered safeguarding figures rather than documented daily reconciliation records", "Filing too early", "Using the wrong PSPConnect form"],
      "answer": 1
    },
    {
      "question": "The senior officer attestation in the annual report signifies that:",
      "options": ["A compliance analyst has reviewed the report for accuracy", "A designated senior officer declares the report information is accurate and complete to the best of their knowledge", "The BoC has reviewed and approved the PSP's compliance status", "An external auditor has verified the figures"],
      "answer": 1
    },
    {
      "question": "If errors are discovered in a submitted annual report, the PSP should:",
      "options": ["Wait for the BoC to identify the errors during the next examination", "Submit a corrected report proactively with an explanation — this is significantly better than having the BoC discover the discrepancy", "File the correction in the following year's report", "Notify FINTRAC, not the BoC"],
      "answer": 1
    },
    {
      "question": "The BoC uses annual report data primarily to:",
      "options": ["Set the PSP's annual registration fee for the following year", "Inform risk-based supervision scheduling — PSPs with higher volumes and more incidents receive closer attention", "Share with FINTRAC for AML risk assessment", "Publish PSP-level compliance ratings publicly"],
      "answer": 1
    },
    {
      "question": "Annual report preparation should ideally begin:",
      "options": ["On March 30 — the day before the deadline", "At least 6 weeks before March 31 to allow data collection, drafting, senior officer review, and corrections", "In October, for the preceding year", "Only after the daily reconciliation for December 31 is complete"],
      "answer": 1
    }
  ]$qz_re1$::jsonb,
  $res_re1$[
    {"label": "BoC — Information for PSPs", "url": "https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/", "type": "Official Guidance"},
    {"label": "PSPConnect — Annual Reporting Portal", "url": "https://rps.bankofcanada.ca", "type": "Portal"},
    {"label": "BoC — Significant Change Step-by-Step Guide (May 2025)", "url": "https://www.bankofcanada.ca/wp-content/uploads/2025/05/how-complete-notice-significant-change-new-activity-a-step-by-step-guide.pdf", "type": "Official Guidance"},
    {"label": "RPAA — Full Text", "url": "https://laws-lois.justice.gc.ca/eng/acts/R-8.4/", "type": "Statute"}
  ]$res_re1$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- R-E2  Consumer-Driven Banking & Evolving Payments Regulation
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Consumer-Driven Banking & Evolving Payments Regulation',
  'compliance', 'boc_rpaa_elective', false, 24, 40, 70,
  'All staff',
  'The Canadian open banking framework (Consumer-Driven Banking Act), Payments Canada modernisation (Lynx, RTR), G20 cross-border roadmap, BoC digital currency research, and how eFinMoney can prepare for an evolving regulatory landscape.',
  $sm_re2$[
    {
      "title": "Canada's Open Banking Framework — The Consumer-Driven Banking Act",
      "body": "Canada's open banking framework — officially named Consumer-Driven Banking — became law on June 20, 2024, when the Consumer-Driven Banking Act (CDBA) received Royal Assent as part of Bill C-69, the Budget Implementation Act. The CDBA establishes a framework under which consumers can authorise third-party providers (TPPs) to access their financial data held at participating financial institutions. The Financial Consumer Agency of Canada (FCAC) is designated as the primary regulator. Key principles of the framework: (1) Consumer consent is at the centre — data sharing occurs only at the consumer's explicit direction. (2) Participating institutions must share data through a standardised, secure API (the technical standard is still being developed by FCAC as of 2025). (3) TPPs must be accredited to access data — accreditation involves security and privacy requirements. For eFinMoney, consumer-driven banking could provide access to clients' bank account transaction history (with consent) to improve KYC accuracy and fraud detection at onboarding."
    },
    {
      "title": "What Open Banking Means for PSPs",
      "body": "The practical implications of consumer-driven banking for PSPs are significant. On the opportunity side: (1) Better KYC — with a client's consent, eFinMoney could access their banking transaction history through a standardised API to verify income and spending patterns, reducing reliance on paper documents and manual review. (2) Fraud reduction — real-time access to account data (with consent) could detect unusual patterns before they escalate. (3) Faster onboarding — automated account verification (confirming the client owns the account they claim to use for funding) reduces manual steps. On the obligation side: (1) PSPs who participate as TPPs must obtain accreditation from FCAC, which involves meeting security, privacy, and operational standards. (2) Liability framework — if data accessed under consumer-driven banking is misused or exposed, the PSP bears regulatory responsibility under the CDBA and PIPEDA. PSPs should monitor FCAC's technical standard publications in 2025–2026 as the framework rolls out."
    },
    {
      "title": "Payments Canada's Modernisation — Lynx and the Real-Time Rail",
      "body": "Payments Canada operates Canada's core payment systems. Two systems are particularly relevant: (1) Lynx — Canada's high-value payment system, which launched in November 2021, replacing the Legacy Large Value Transfer System (LVTS). Lynx settles in real time in central bank money (Bank of Canada reserves), providing finality and eliminating credit risk between participants. Direct Lynx participants are federally regulated financial institutions. PSPs generally access Lynx settlement indirectly through their settlement bank. Understanding Lynx matters because eFinMoney's Canadian-side settlement flows through Lynx-connected institutions. (2) Real-Time Rail (RTR) — Payments Canada's planned 24/7 real-time low-value payment system, designed to allow Canadians to send and receive money instantly at any time. As of 2025, the RTR is still in development and has experienced significant delays. When operational, the RTR could allow PSPs — either as direct participants or through sponsored access — to offer instant remittance crediting on the Canadian side."
    },
    {
      "title": "The G20 Cross-Border Payments Roadmap",
      "body": "The Financial Stability Board (FSB), at the direction of the G20, has published a roadmap for improving cross-border payments with specific 2027 targets: (1) Cost — reduce the global average cost of sending a remittance to below 3% of transaction value (from approximately 6% as of 2022). (2) Speed — 75% of cross-border retail payments should arrive within one hour. (3) Access — at least 90% of the world's population should have access to at least one cross-border payment provider. (4) Transparency — end users should receive upfront disclosure of fees, exchange rates, and expected delivery time. These targets directly affect eFinMoney's competitive position. A corridor where eFinMoney charges 6% and takes 2 business days will face growing competitive pressure from providers who achieve sub-3% and sub-1-hour delivery. Compliance departments should track FSB publications on G20 roadmap progress, as regulatory requirements (particularly transparency) will tighten as the 2027 deadline approaches."
    },
    {
      "title": "BoC Digital Currency Research — The Digital Canadian Dollar",
      "body": "The Bank of Canada has been researching a Central Bank Digital Currency (CBDC) — a digital form of the Canadian dollar issued directly by the BoC. As of 2025, no CBDC has been launched; the BoC describes the work as research and consultation, not a firm commitment to issue. Key BoC positions: (1) A digital Canadian dollar, if issued, would complement — not replace — existing payment methods. (2) It would be usable offline (unlike current digital payments that require connectivity). (3) Privacy is a design priority — the BoC acknowledges that a CBDC raises significant privacy concerns relative to cash. For PSPs and MSBs, a CBDC would create a new payment rail with direct central bank backing. If the BoC issues a digital Canadian dollar that is accessible to non-bank payment providers, it could fundamentally change how eFinMoney settles transactions and holds client funds. It could also affect the AML framework — regulators will need to design reporting obligations for CBDC transactions. Monitor BoC consultation papers for developments."
    },
    {
      "title": "Regulatory Horizon Scanning — Building the Habit",
      "body": "In a rapidly evolving regulatory environment, compliance teams must build a systematic horizon-scanning process rather than reacting to changes after they take effect. Practical approach: (1) Maintain a regulatory watch list — a living document listing the key regulations and consultations currently in progress, with expected implementation dates and potential impact ratings. (2) Subscribe to key regulator publications: BoC staff discussion papers; FINTRAC consultation notices; FCAC bulletins; FSB cross-border payment progress reports; FATF plenary conclusions (three times per year). (3) Industry associations — eFinMoney should be an active participant in Money Services Business Association of Canada (MSBAC) and the Canadian Payments Association's member forums, which provide early intelligence on regulatory consultations. (4) Engage in consultations — regulators publish draft guidelines and invite comment. Submitting a comment on a FINTRAC or BoC consultation puts eFinMoney on the regulator's radar as an engaged participant and can influence the final rule."
    },
    {
      "title": "Preparing eFinMoney for the Evolving Landscape",
      "body": "Three practical steps eFinMoney can take now to prepare for the regulatory changes ahead: (1) Technology readiness — ensure the core banking and compliance system can accommodate API-based data sharing (for consumer-driven banking) and real-time payment processing (for the RTR). Legacy systems that require manual processing will struggle to meet the G20 speed targets. (2) Data governance — consumer-driven banking will require strong data governance: clear data flows, consent management, and privacy-by-design principles. Build these capabilities now rather than retrofitting them when the technical standard is mandated. (3) Compliance agility — the compliance program should be designed to adapt: modular policies that can be updated by section without rewriting the whole document; a risk assessment that explicitly lists emerging regulatory changes as a risk category; and a training calendar that includes updates when major regulatory developments occur. An agile compliance program is not one that changes with every rumour — it is one that has the infrastructure to adapt quickly when the obligation is confirmed."
    }
  ]$sm_re2$::jsonb,
  $qz_re2$[
    {
      "question": "Canada's open banking framework is established by:",
      "options": ["The Retail Payment Activities Act (RPAA)", "The Consumer-Driven Banking Act (CDBA), which received Royal Assent in June 2024", "The Bank of Canada Act", "The PCMLTFA amendments of 2024"],
      "answer": 1
    },
    {
      "question": "The primary regulator for Canada's consumer-driven banking framework is:",
      "options": ["The Bank of Canada", "OSFI", "The Financial Consumer Agency of Canada (FCAC)", "FINTRAC"],
      "answer": 2
    },
    {
      "question": "The core principle of consumer-driven banking is:",
      "options": ["Banks must share all client data with competing financial institutions", "Consumers can authorise third-party providers to access their financial data, with data sharing only at the consumer's explicit direction", "PSPs can access client bank data without consent for fraud detection", "The government maintains a central database of all Canadians' financial accounts"],
      "answer": 1
    },
    {
      "question": "Canada's high-value payment system Lynx replaced which predecessor system?",
      "options": ["SWIFT", "The Legacy Large Value Transfer System (LVTS)", "Interac e-Transfer", "The Automated Clearing Settlement System (ACSS)"],
      "answer": 1
    },
    {
      "question": "The G20 cross-border payments roadmap targets a global average remittance cost below what threshold by 2027?",
      "options": ["1% of transaction value", "3% of transaction value", "5% of transaction value", "10% of transaction value"],
      "answer": 1
    },
    {
      "question": "The G20 cross-border payments roadmap speed target requires that, by 2027:",
      "options": ["All cross-border payments arrive within 24 hours", "75% of cross-border retail payments arrive within one hour", "50% of cross-border payments arrive within 30 minutes", "Instant settlement for all G20-corridor payments"],
      "answer": 1
    },
    {
      "question": "As of 2025, the Bank of Canada's position on a digital Canadian dollar (CBDC) is:",
      "options": ["A digital Canadian dollar will launch in Q1 2026", "Research and consultation is underway but no firm commitment to issue a CBDC has been made", "The BoC has rejected CBDCs as incompatible with Canadian privacy law", "A digital Canadian dollar is already available for PSP use through PSPConnect"],
      "answer": 1
    },
    {
      "question": "The Payments Canada Real-Time Rail (RTR), if and when it launches, would allow PSPs to:",
      "options": ["Access Lynx directly for high-value settlement", "Offer instant, 24/7 payment processing — potentially including instant remittance crediting on the Canadian side", "Replace the annual BoC registration obligation", "Process cross-border payments without RPAA obligations"],
      "answer": 1
    },
    {
      "question": "An effective regulatory horizon-scanning process should include:",
      "options": ["Reading regulatory changes only after they come into force", "A living watch list, subscriptions to key regulator publications, industry association participation, and engagement in consultations", "Delegating regulatory monitoring entirely to external legal counsel", "A quarterly search of the Canada Gazette only"],
      "answer": 1
    },
    {
      "question": "Consumer-driven banking could benefit eFinMoney's compliance program by:",
      "options": ["Allowing eFinMoney to sell client data to other financial institutions", "Enabling access to clients' bank account transaction history (with consent) to improve KYC accuracy and fraud detection", "Eliminating the need for ID verification under the PCMLTFA", "Providing direct access to FINTRAC's client database"],
      "answer": 1
    }
  ]$qz_re2$::jsonb,
  $res_re2$[
    {"label": "BoC — Consumer-Driven Banking Overview", "url": "https://www.bankofcanada.ca/core-functions/financial-system/consumer-driven-banking/", "type": "Official Guidance"},
    {"label": "FCAC — Consumer-Driven Banking", "url": "https://www.canada.ca/en/financial-consumer-agency/programs/consumer-driven-banking.html", "type": "Official Guidance"},
    {"label": "BoC — Payments Canada Modernisation", "url": "https://www.bankofcanada.ca/core-functions/financial-system/payments-canada/", "type": "Official Guidance"},
    {"label": "FSB — G20 Cross-Border Payments Roadmap", "url": "https://www.fsb.org/work-of-the-fsb/financial-innovation-and-structural-change/cross-border-payments/", "type": "Official Guidance"},
    {"label": "BoC — Digital Canadian Dollar Consultation", "url": "https://www.bankofcanada.ca/digital-currencies-and-fintech/digital-currencies/", "type": "Official Guidance"}
  ]$res_re2$::jsonb,
  '[]'::jsonb
);

-- ==============================================================
-- Part B — Role-based auto-assignment trigger
-- ==============================================================

-- Function: fires AFTER INSERT on user_roles.
-- Maps each app_role to the program areas whose mandatory
-- courses should be auto-assigned.
--
-- Role → program areas assigned:
--   admin, compliance, finance  → fintrac_mandatory + boc_rpaa_mandatory
--   user, support               → fintrac_mandatory only
--
-- Due date: 30 calendar days from assignment date.
-- ON CONFLICT DO NOTHING keeps the function idempotent —
-- re-inserting a role does not reset an in-progress assignment.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.auto_assign_mandatory_training()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_date date;
  v_program_areas text[];
BEGIN
  v_due_date := current_date + interval '30 days';

  IF NEW.role IN ('admin', 'compliance', 'finance') THEN
    v_program_areas := ARRAY['fintrac_mandatory', 'boc_rpaa_mandatory'];
  ELSE
    -- 'user', 'support'
    v_program_areas := ARRAY['fintrac_mandatory'];
  END IF;

  INSERT INTO public.training_assignments
    (staff_id, course_id, status, expected_completion_date)
  SELECT
    NEW.user_id,
    tc.id,
    'assigned',
    v_due_date
  FROM public.training_courses tc
  WHERE tc.is_mandatory = true
    AND tc.program_area = ANY(v_program_areas)
  ON CONFLICT (staff_id, course_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop before (re-)create so the migration is re-runnable.
DROP TRIGGER IF EXISTS trg_auto_assign_mandatory_training
  ON public.user_roles;

CREATE TRIGGER trg_auto_assign_mandatory_training
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_mandatory_training();
