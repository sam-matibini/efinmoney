-- ==============================================================
-- Phase 4: Consulting programme — 10 new courses (all INSERT)
-- Content bridges regulatory knowledge with advisory methodology.
-- C-01  MSB Registration Consulting             — 7L 10Q
-- C-02  PSP / RPAA Registration Advisory        — 7L 10Q
-- C-03  AML/ATF Compliance Program Design       — 8L 12Q
-- C-04  ML/TF Risk Assessment Methodology       — 7L 10Q
-- C-05  CDD & EDD Framework Design              — 7L 10Q
-- C-06  Transaction Monitoring Program Design   — 7L 10Q
-- C-07  Sanctions & Adverse Media Screening     — 7L 10Q
-- C-08  Safeguarding Program Design (RPAA)      — 7L 10Q
-- C-09  ORM & Incident Response Design          — 8L 12Q
-- C-10  Regulatory Examination Preparation      — 7L 10Q
-- ==============================================================

-- ---------------------------------------------------------------
-- C-01  MSB Registration Consulting
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'MSB Registration Consulting',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'How to guide clients through FINTRAC MSB registration, annual renewal, activity scoping, and verification of registration status.',
  $sm_c01$[
    {
      "title": "Scoping the Registration Obligation",
      "body": "The first step in any MSB registration engagement is determining whether the client is actually required to register. Under s.54 PCMLTFA, registration is mandatory for any person conducting one or more of the following as a business: foreign exchange dealing, funds transfer (money transmission), issuing or redeeming money orders or traveller's cheques, dealing in virtual currency, and operating a crowdfunding platform. 'As a business' means in the ordinary course of commercial activity — not a one-off transaction. Consultants must interview the client about every revenue-generating activity and map each to the statutory definitions. A retailer who also exchanges foreign currency informally for customers may not realise they qualify as an MSB. Documenting the scoping analysis protects the consultant and creates a record for FINTRAC if the registration is ever questioned."
    },
    {
      "title": "The FINTRAC Registration Process",
      "body": "FINTRAC MSB registration is completed online at the FINTRAC website. The registration requires: the entity's legal name and all trade names; business address and contact information; the specific MSB activities conducted; and, if virtual currency is involved, confirmation of the specific VC activities. The registration must be completed before the entity begins conducting MSB activities — operating without a valid registration is an offence. Consultants should guide clients through the online form, ensure all applicable activity categories are selected (under-registration is a risk if new activities are added later without updating), and confirm the registration number is received and retained. The registration must be renewed annually — set a calendar reminder at the time of initial registration."
    },
    {
      "title": "Annual Renewal and Keeping Registration Current",
      "body": "FINTRAC MSB registration must be renewed every year. Failure to renew results in lapsed registration — the entity becomes unregistered and any MSB activities conducted while unregistered are violations. Beyond annual renewal, the registration must be updated within 30 days if: the entity's legal name changes; a new MSB activity is commenced; an existing activity ceases; or the entity's address or contact information changes. Consultants advising ongoing clients should build a compliance calendar that includes: the annual FINTRAC renewal date; a trigger for reviewing the registration whenever a new product or service is proposed; and a quarterly check that the registration information on file with FINTRAC accurately reflects current operations."
    },
    {
      "title": "Verifying a Counterparty's Registration",
      "body": "A key consulting service is due diligence on counterparties. eFinMoney — and its clients — may need to verify that a business partner or referral agent is a registered MSB before conducting business with them. FINTRAC's MSB registry is publicly searchable at fintrac-canafe.gc.ca/msb-esm/public. The search returns the entity's legal name, trade names, registration number, registration date, and the MSB activities they are registered for. Consultants should document this verification in their client's compliance file: screenshot the registry result, note the search date, and flag any discrepancy (e.g., the counterparty claims to be registered but does not appear in the registry, or is registered for different activities than claimed). Dealing with an unregistered MSB is itself a compliance red flag."
    },
    {
      "title": "De-registration and Activity Cessation",
      "body": "When a client ceases all MSB activities, they must notify FINTRAC and request de-registration. Operating as a registered MSB without conducting any of the registered activities is not problematic, but it keeps the entity subject to compliance obligations (reporting, record keeping, examination) unnecessarily. When a client is planning to close a line of business, consultants should: review whether any other registered activity continues (if so, only that activity should be de-registered); advise on the record-keeping obligations that survive de-registration (records must still be retained for the 5-year period even after the business closes); and ensure the de-registration is processed before the entity is wound up, since outstanding FINTRAC obligations run with the entity."
    },
    {
      "title": "Common Registration Errors and How to Avoid Them",
      "body": "In practice, the most common MSB registration errors are: (1) Registering for the wrong activities — a client who transfers money and exchanges foreign currency must register for both; selecting only one is under-registration. (2) Failing to update after adding virtual currency — a client who adds Bitcoin payments without updating their FINTRAC registration is operating an unregistered MSB for that activity. (3) Letting registration lapse — missing the annual renewal, often because no one owns the renewal task. (4) Using a trade name not listed on the registration — FINTRAC expects the registered entity's name (or a listed trade name) to appear in client-facing materials. Consultants should conduct a registration audit as part of every initial engagement to identify and remediate these errors before FINTRAC does."
    },
    {
      "title": "Deliverables for an MSB Registration Engagement",
      "body": "A well-structured MSB registration consulting engagement produces: (1) Activity scoping memo — documents the analysis of which activities require registration and why. (2) Registration confirmation — a copy of the FINTRAC registration certificate and registration number. (3) Compliance calendar — annual renewal date, 30-day update triggers, and counterparty verification checkpoints. (4) Registration maintenance procedure — a one-page procedure telling the client who is responsible for the annual renewal, how to update the registration when activities change, and how to conduct counterparty registration checks. (5) Training record — confirm that the compliance officer and relevant staff have been briefed on registration obligations and consequences of non-compliance."
    }
  ]$sm_c01$::jsonb,
  $qz_c01$[
    {
      "question": "Before a client begins conducting any MSB activity, they must:",
      "options": ["File an STR with FINTRAC", "Complete MSB registration with FINTRAC", "Register with the Bank of Canada", "Obtain a banking licence"],
      "answer": 1
    },
    {
      "question": "MSB registration must be renewed:",
      "options": ["Every 6 months", "Every year", "Every 2 years", "Every 5 years"],
      "answer": 1
    },
    {
      "question": "A client who adds virtual currency dealing to an existing MSB must:",
      "options": ["File a new registration as a separate entity", "Update their FINTRAC registration within 30 days to add the new activity", "Do nothing if they are already registered for other MSB activities", "Notify the Bank of Canada"],
      "answer": 1
    },
    {
      "question": "A client wants to verify that a new payment partner is a registered MSB. Where do you direct them?",
      "options": ["OSFI's institution registry", "FINTRAC's public MSB registry at fintrac-canafe.gc.ca/msb-esm/public", "The Bank of Canada's PSP Registry", "Canada Revenue Agency's business registry"],
      "answer": 1
    },
    {
      "question": "The most common MSB registration error consultants encounter is:",
      "options": ["Over-registering for too many activities", "Under-registering — failing to list all applicable MSB activities", "Registering too early before business commences", "Using the wrong physical address"],
      "answer": 1
    },
    {
      "question": "When a client ceases all MSB activities and winds up the business, which obligation survives?",
      "options": ["Annual FINTRAC renewal", "Record-keeping for the remaining 5-year retention period", "Monthly STR filing", "Quarterly risk assessments"],
      "answer": 1
    },
    {
      "question": "A client uses a trade name not listed on their FINTRAC registration in marketing materials. This is:",
      "options": ["Acceptable if the legal name appears somewhere on the website", "A registration deficiency — trade names used in client-facing materials must be listed on the registration", "Only relevant for virtual currency MSBs", "Permitted if the trade name is registered provincially"],
      "answer": 1
    },
    {
      "question": "Which deliverable is most important for maintaining ongoing MSB registration compliance?",
      "options": ["A marketing plan", "A compliance calendar with renewal dates and activity-change triggers", "An annual financial statement", "A client satisfaction survey"],
      "answer": 1
    },
    {
      "question": "A client asks whether they need to register as an MSB to informally exchange foreign currency for their retail customers. The answer is:",
      "options": ["No — retail activities are always exempt", "Yes — if they exchange foreign currency as a business activity, they qualify as an MSB and must register", "Only if they exchange more than $10,000 per month", "Only if they charge a fee for the exchange"],
      "answer": 1
    },
    {
      "question": "Dealing with an unregistered MSB counterparty is:",
      "options": ["Permitted if the counterparty is a small business", "A compliance red flag that should be documented and assessed", "Allowed for transactions under $1,000", "Only a risk if the counterparty is in a high-risk jurisdiction"],
      "answer": 1
    }
  ]$qz_c01$::jsonb,
  $res_c01$[
    {"label": "FINTRAC — MSB Registration", "url": "https://www.fintrac-canafe.gc.ca/msb-esm/msb-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Public MSB Registry Search", "url": "https://www.fintrac-canafe.gc.ca/msb-esm/public", "type": "Portal"},
    {"label": "PCMLTFA — Full Text", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html", "type": "Statute"}
  ]$res_c01$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-02  PSP / RPAA Registration Advisory
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'PSP Registration & RPAA Advisory',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Advisory methodology for guiding clients through RPAA PSP registration, scoping, PSPConnect, annual reporting, and significant change notifications.',
  $sm_c02$[
    {
      "title": "Scoping the PSP Registration Obligation",
      "body": "Not every payment business must register as a PSP under the RPAA. The Act covers five retail payment activities: holding end-user funds; maintaining an account holding end-user funds; initiating a payment order at an end user's request; authorising a payment order; and clearing or settling payment obligations. The client must have at least one Canadian end user — either located in Canada or a Canadian person transacting cross-border. Key scoping questions: Does the client receive funds from end users before initiating a payment? Does the client hold funds in accounts on behalf of end users? Is the client the final step in the payment chain (beneficiary bank) or an intermediary? Entities that process payments only on their own behalf (a retailer processing its own sales) are excluded. The scoping analysis should be documented in a written memo signed by a senior consultant."
    },
    {
      "title": "Navigating the PSPConnect Registration Process",
      "body": "Once scoped in, the client must register at PSPConnect (rps.bankofcanada.ca) before commencing retail payment activities. The application requires: legal entity details; description of payment activities; safeguarding arrangement details (which eligible accounts will be used, at which institution); ORM framework attestation; and payment of the $2,500 initial fee. Consultants should review the client's draft registration for completeness and accuracy before submission. A common error is submitting an incomplete description of payment activities — the registration should describe all activities, not just the most visible ones. After registration, confirm the PSP number appears in the public registry, and set a March 31 annual report reminder for the client."
    },
    {
      "title": "Annual Report Advisory",
      "body": "Every registered PSP must submit an annual report to the BoC by March 31. Consultants supporting this engagement should begin the annual report preparation process at least 6 weeks before the deadline: (1) Collect the average value of end-user funds held over the reporting year, verified against daily reconciliations. (2) Confirm the eligible safeguarding accounts used, including institution names and confirmation that no commingling occurred. (3) Document any operational incidents that occurred during the year and confirm all were notified to the BoC within the required timelines. (4) List any significant changes implemented during the year and confirm all were pre-notified. (5) Draft the senior officer attestation for client review and sign-off. Filing late — even by one day — is a compliance deficiency."
    },
    {
      "title": "Significant Change and New Activity Advising",
      "body": "A critical consulting value-add is ensuring clients pre-notify the BoC before implementing significant changes. Changes that typically require pre-notification include: acquiring another payment business; adding a new payment corridor (especially to a high-risk jurisdiction); changing the safeguarding institution; materially changing the ORM framework; or commencing a new type of retail payment activity. The BoC's May 2025 step-by-step guide for significant change notifications describes the process in PSPConnect. Consultants should embed an RPAA change-notification question into the client's project approval checklist: 'Does this change require BoC pre-notification?' — this catches changes before implementation. The consequences of failing to pre-notify (a separate violation from the change itself) can be more damaging than the change itself."
    },
    {
      "title": "BoC Registry Due Diligence",
      "body": "eFinMoney's consulting clients may need to verify that their own payment partners are registered PSPs. The Bank of Canada's public PSP Registry (bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/) lists all registered PSPs with their registration number and registered activities. Consultants should document this verification in due diligence files. A business that claims PSP status but does not appear in the registry is operating illegally — eFinMoney and its clients should not send funds to or through such entities without resolving the discrepancy. The registry is a live document updated when registrations are granted, lapsed, or withdrawn; a verification done 6 months ago may no longer be current."
    },
    {
      "title": "Dual Registration — MSB and PSP",
      "body": "Many eFinMoney consulting clients will hold both an MSB registration (FINTRAC) and a PSP registration (BoC). These are entirely separate registrations with different obligations, different regulators, and different reporting timelines. Common confusion points: FINTRAC's STR deadline (30 days) vs. BoC's incident notification (24h/72h); FINTRAC's annual compliance review vs. BoC's annual report; FINTRAC's 5-element compliance program vs. BoC's ORM framework. Consultants must ensure clients understand which obligation belongs to which regulator and do not conflate them. A 'combined compliance calendar' that lists both regimes' key dates side by side is a useful deliverable that clients reference year-round."
    },
    {
      "title": "Deliverables for a PSP Registration Engagement",
      "body": "A PSP registration engagement should produce: (1) Scoping memo — analysis of which RPAA activities apply and why. (2) Registration confirmation — PSP number, PSPConnect screenshot, public registry verification. (3) Safeguarding account setup confirmation — eligible account evidence, written safeguarding policy. (4) ORM framework attestation support document — summary of the client's ORM framework as submitted in the registration. (5) Combined compliance calendar — FINTRAC + BoC key dates side by side. (6) Significant change trigger checklist — embedded in client's project approval process. (7) Annual report preparation timeline — 6-week pre-March 31 workflow. These deliverables form the foundation of ongoing RPAA compliance advisory."
    }
  ]$sm_c02$::jsonb,
  $qz_c02$[
    {
      "question": "A key scoping question to determine if a client needs RPAA registration is:",
      "options": ["Does the client have more than 50 employees?", "Does the client receive or hold funds from end users in connection with a payment activity?", "Does the client process more than $1 million per year?", "Does the client have a FINTRAC MSB registration?"],
      "answer": 1
    },
    {
      "question": "The PSP registration portal is at:",
      "options": ["fintrac-canafe.gc.ca", "rps.bankofcanada.ca (PSPConnect)", "osfi-bsif.gc.ca", "canada.ca/cra"],
      "answer": 1
    },
    {
      "question": "The initial RPAA registration fee is:",
      "options": ["$500", "$1,000", "$2,500", "$5,000"],
      "answer": 2
    },
    {
      "question": "PSP annual reports must be submitted to the BoC by:",
      "options": ["December 31 of the reporting year", "January 31 of the following year", "March 31 of the following year", "June 30 of the following year"],
      "answer": 2
    },
    {
      "question": "A client plans to change their safeguarding institution. They must:",
      "options": ["Notify FINTRAC first", "Pre-notify the Bank of Canada before implementing the change", "Update the registration only at the next annual report", "Get written approval from CDIC"],
      "answer": 1
    },
    {
      "question": "The most effective way to prevent a client from failing to pre-notify significant changes is:",
      "options": ["Quarterly reminder emails", "Embedding an RPAA change-notification question into the client's project approval checklist", "Subscribing to BoC newsletters", "Reviewing all changes at the annual report stage"],
      "answer": 1
    },
    {
      "question": "A client's payment partner claims to be a registered PSP but does not appear in the BoC's public PSP Registry. The consultant should:",
      "options": ["Accept the claim and proceed", "Treat this as a red flag, document the discrepancy, and resolve it before the client transacts with the partner", "Only verify registry status annually", "Report the partner to the BoC immediately"],
      "answer": 1
    },
    {
      "question": "A client with both an MSB (FINTRAC) and PSP (BoC) registration faces which key confusion risk?",
      "options": ["Filing duplicate annual reports", "Conflating FINTRAC timelines (e.g., 30-day STR) with BoC timelines (e.g., 24h/72h incident notice)", "Paying duplicate registration fees", "Over-reporting to both regulators for the same event"],
      "answer": 1
    },
    {
      "question": "Annual report preparation should begin how far before the March 31 deadline?",
      "options": ["The week before", "At least 6 weeks before, to allow time for data collection, drafting, and sign-off", "On March 30 only", "6 months before"],
      "answer": 1
    },
    {
      "question": "Which of the following is NOT a retail payment activity under the RPAA?",
      "options": ["Holding end-user funds", "Initiating a payment order at an end user's request", "Processing payments solely on the entity's own behalf (a retailer's own sales)", "Maintaining an account that holds end-user funds"],
      "answer": 2
    }
  ]$qz_c02$::jsonb,
  $res_c02$[
    {"label": "BoC — Information for PSPs", "url": "https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/", "type": "Official Guidance"},
    {"label": "PSPConnect — Registration Portal", "url": "https://rps.bankofcanada.ca", "type": "Portal"},
    {"label": "BoC — Public PSP Registry", "url": "https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/", "type": "Portal"},
    {"label": "BoC — Significant Change Step-by-Step Guide (May 2025)", "url": "https://www.bankofcanada.ca/wp-content/uploads/2025/05/how-complete-notice-significant-change-new-activity-a-step-by-step-guide.pdf", "type": "Official Guidance"}
  ]$res_c02$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-03  AML/ATF Compliance Program Design
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'AML/ATF Compliance Program Design',
  'compliance', 'consulting', false, 12, 60, 75,
  'Consulting staff',
  'How to design, build, and implement a FINTRAC-compliant five-element AML/ATF compliance program for a new or remediated MSB client.',
  $sm_c03$[
    {
      "title": "Engagement Scoping — What the Client Has and Needs",
      "body": "Before designing a compliance program, the consultant must assess the client's current state. Key questions: Does the client have a designated compliance officer? Are written policies documented or informal? Has a risk assessment ever been conducted? When was the last staff training? Has FINTRAC examined the client before — and if so, what were the findings? This diagnostic phase typically involves reviewing existing policy documents, interviewing the compliance officer (or the person acting in that role), sampling recent transaction records, and reviewing any FINTRAC correspondence. The output is a gap assessment that maps current state to the five required elements: compliance officer, policies, risk assessment, training, and effectiveness review. The gap assessment is the foundation of the program design engagement — without it, the consultant is building blindly."
    },
    {
      "title": "Element 1 — Designing the Compliance Officer Role",
      "body": "The compliance officer designation is the simplest element to establish formally, but the most important to get right in practice. FINTRAC requires the compliance officer to have sufficient authority and resources. Consultants should: (1) Confirm the designee has a direct reporting line to senior management or the board, not buried in operations. (2) Draft a formal designation letter and board resolution. (3) Define the compliance officer's responsibilities in writing, including: day-to-day program oversight, FINTRAC reporting sign-off, exam preparation, training oversight, and policy maintenance. (4) Assess whether the designee has adequate knowledge — for a new compliance officer, recommend a training plan covering FINTRAC fundamentals, the client's specific obligations (MSB activities), and FINTRAC reporting procedures. A compliance officer with authority but no knowledge is as risky as one with knowledge but no authority."
    },
    {
      "title": "Element 2 — Writing Policies and Procedures",
      "body": "Compliance policies must be tailored to the client's specific MSB activities and risk profile — not a generic template. The policy suite for a typical MSB should include: AML/ATF Policy (overall framework and scope); Client Identification and Verification Procedure (thresholds, methods, documentation); PEP and Third-Party Determination Procedure; Suspicious Transaction Assessment and Reporting Procedure (including the tipping-off prohibition); LCTR/EFTR Reporting Procedure; Transaction Monitoring Procedure; Record Keeping and Retention Procedure; Sanctions Screening Procedure; Compliance Training Procedure; and Risk Assessment Maintenance Procedure. Each procedure should specify: who is responsible, what triggers it, step-by-step actions, what records to create, and escalation paths. Consultants should draft all policies collaboratively with the client's staff to ensure operational accuracy."
    },
    {
      "title": "Element 3 — Conducting the ML/TF Risk Assessment",
      "body": "The risk assessment is the analytical engine of the compliance program — it determines the level of controls applied to each area. Consultants lead the risk assessment by: (1) Identifying the client's relevant risk categories: client types, products/services, delivery channels, and geographic exposures. (2) Assigning inherent risk ratings (before controls) to each category using a 1–5 scale. (3) Assessing existing controls and their effectiveness. (4) Calculating residual risk (after controls). (5) Identifying areas where residual risk exceeds the client's risk appetite — these become remediation priorities. (6) Documenting the assessment in a formal risk assessment report approved by senior management. The risk assessment should be reviewed annually and updated immediately when a new product is launched, a new corridor is opened, or FINTRAC updates its risk guidance for the relevant sector."
    },
    {
      "title": "Element 4 — Designing the Training Program",
      "body": "The training program must cover all staff who deal with clients or handle transactions. Consultants should design a training matrix: rows are staff roles, columns are training modules. At each intersection, mark whether the module is required for that role and how frequently. For a typical MSB, the matrix might include: AML/ATF fundamentals (all staff, annual); Client identification procedures (client-facing staff, annual); STR recognition and reporting (compliance and management, annual); LCTR/EFTR procedures (operations staff, annual); PEP and sanctions screening (compliance and operations, annual). Training materials should be tailored to the client's specific products and corridors — not generic FINTRAC content. Assessments should be included and pass rates documented. The training log (who was trained, when, on what) must be retained for 5 years."
    },
    {
      "title": "Element 5 — Structuring the Effectiveness Review",
      "body": "The effectiveness review must be conducted at least every two years by someone independent of day-to-day compliance operations. Consultants are well-positioned to conduct this review. The review should cover: (1) Are all five elements of the compliance program in place? (2) Are policies current and reflecting current regulations? (3) Is the risk assessment up to date? (4) Is training occurring as scheduled and are pass rates adequate? (5) Are FINTRAC reports being filed on time and with complete information? (6) Is client identification being completed at the required thresholds? (7) Is the monitoring program generating alerts proportionate to the risk profile? The output is a written effectiveness review report with findings, ratings, and recommended remediation actions. The report must be provided to senior management and, for serious findings, the board."
    },
    {
      "title": "Implementation Roadmap and Change Management",
      "body": "Designing a compliance program on paper is only half the engagement. Implementation requires change management: staff must understand why new procedures exist, not just what they must do. Key implementation steps: (1) Socialise the policies before finalising — draft review by affected staff catches operational gaps the consultant may miss. (2) Train all staff before the new procedures go live. (3) Run a parallel period if possible — apply new procedures alongside existing ones for 30 days before switching over, allowing troubleshooting. (4) Establish a policy questions channel — a designated person (usually the compliance officer) who staff can ask when they are unsure how to apply a procedure. (5) Set a 90-day post-implementation review to catch teething issues. The engagement is not complete until the program is operating, not just documented."
    },
    {
      "title": "Common Program Design Pitfalls",
      "body": "The most common pitfalls in compliance program design engagements: (1) Overly complex policies that staff cannot follow — a six-page STR procedure with 15 decision trees is not workable at the front line. Aim for clarity. (2) Risk assessments that are forms exercises — completed quickly to tick a box, without genuine analysis. (3) Training that is one-and-done — a single all-staff session at program launch, with no ongoing schedule. (4) Effectiveness reviews conducted by the compliance officer themselves — this is not 'independent' and will be flagged by FINTRAC. (5) Policies approved by management but never communicated to staff. (6) A compliance program designed for the consultant's template rather than the client's actual operations. Every compliance program must be the client's — not the consultant's generic product."
    }
  ]$sm_c03$::jsonb,
  $qz_c03$[
    {
      "question": "The first step in a compliance program design engagement should be:",
      "options": ["Writing the policies immediately", "Conducting a gap assessment to map current state against the five required elements", "Designating a compliance officer", "Filing an STR on the client's behalf"],
      "answer": 1
    },
    {
      "question": "The five mandatory elements of a FINTRAC compliance program are:",
      "options": ["Compliance officer, policies, risk assessment, training, and effectiveness review", "Compliance officer, LCTR filing, STR filing, training, and annual audit", "Registration, reporting, training, monitoring, and examination", "Risk assessment, policies, sanctions screening, CDD, and reporting"],
      "answer": 0
    },
    {
      "question": "A compliance officer must have a reporting line to:",
      "options": ["The front-line operations team", "Senior management or the board, ensuring sufficient authority", "FINTRAC directly", "The external auditor"],
      "answer": 1
    },
    {
      "question": "Compliance policies must be:",
      "options": ["Generic templates applicable to all MSBs", "Tailored to the client's specific MSB activities, risk profile, and regulatory obligations", "Approved by FINTRAC before use", "Limited to a single page for readability"],
      "answer": 1
    },
    {
      "question": "The ML/TF risk assessment must be reviewed:",
      "options": ["Every 5 years at the effectiveness review", "At least annually and immediately when new products or corridors are added", "Only when FINTRAC requests it", "Once at program inception and never again"],
      "answer": 1
    },
    {
      "question": "The training log must record:",
      "options": ["Only the compliance officer's training", "Who was trained, when, and what content was covered — retained for 5 years", "Only whether training was passed or failed", "Training costs and vendor details"],
      "answer": 1
    },
    {
      "question": "The effectiveness review must be conducted by someone who is:",
      "options": ["The compliance officer", "A FINTRAC-certified examiner", "Sufficiently independent from day-to-day compliance operations", "The client's external auditor only"],
      "answer": 2
    },
    {
      "question": "Which of the following is a common compliance program design pitfall?",
      "options": ["Tailoring policies to the client's specific operations", "Overly complex policies with 15-step procedures that front-line staff cannot follow", "Conducting the risk assessment with full management involvement", "Running a parallel implementation period"],
      "answer": 1
    },
    {
      "question": "The effectiveness review report must be provided to:",
      "options": ["FINTRAC directly", "Senior management and, for serious findings, the board", "Only the compliance officer", "The MSB's banking partner"],
      "answer": 1
    },
    {
      "question": "A 90-day post-implementation review is valuable because:",
      "options": ["It satisfies the FINTRAC effectiveness review requirement", "It catches teething issues before they become systemic compliance failures", "It replaces the annual training requirement", "It updates the risk assessment automatically"],
      "answer": 1
    },
    {
      "question": "A compliance program designed around the consultant's generic template rather than the client's operations is:",
      "options": ["Acceptable if all five elements are present", "A common pitfall — the program must reflect the client's actual activities, not a generic product", "Preferred by FINTRAC for consistency", "Only a problem if the client is in a high-risk sector"],
      "answer": 1
    },
    {
      "question": "Which staff must receive AML/ATF training under a FINTRAC compliance program?",
      "options": ["Only the compliance officer", "Only senior management", "All staff who deal with clients or handle transactions", "Only staff who file FINTRAC reports"],
      "answer": 2
    }
  ]$qz_c03$::jsonb,
  $res_c03$[
    {"label": "FINTRAC — Compliance Program Guide (Guide 4)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Risk-Based Approach Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng", "type": "Official Guidance"}
  ]$res_c03$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-04  ML/TF Risk Assessment Methodology
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'ML/TF Risk Assessment Methodology',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Structured methodology for conducting, documenting, and maintaining ML/TF risk assessments for MSB and PSP clients.',
  $sm_c04$[
    {
      "title": "Purpose and Scope of an ML/TF Risk Assessment",
      "body": "An ML/TF risk assessment identifies and evaluates the money laundering and terrorist financing risks that a reporting entity faces given its specific business model. It is the analytical foundation on which the risk-based approach to compliance is built: without knowing where the risks are, controls cannot be calibrated appropriately. FINTRAC requires a formal written risk assessment as one of the five compliance program elements (PCMLTFR s.9(1)(c)). The assessment must cover, at minimum: client risk, product/service risk, delivery channel risk, and geographic risk. For PSP clients under the RPAA, operational risk (from the ORM framework) is assessed separately but should be cross-referenced. The risk assessment is a living document — not a one-time exercise filed and forgotten."
    },
    {
      "title": "Identifying Risk Factors — Client Typologies",
      "body": "Client risk assessment begins with identifying which client types the entity serves and scoring each type by inherent ML/TF risk. High-risk client categories (based on FINTRAC guidance) include: Politically Exposed Persons (PEPs) and their family/associates; clients from jurisdictions on the FATF grey or black list; clients with cash-intensive businesses; clients who structure transactions or are reluctant to provide identification; and businesses with complex ownership structures designed to obscure the beneficial owner. Medium-risk clients include: regulated businesses (e.g., other MSBs) with their own compliance programs; private individuals sending to lower-risk countries. Low-risk includes: public bodies, regulated financial institutions. Each client type is listed in the risk register with an inherent risk rating and the rationale for that rating."
    },
    {
      "title": "Product and Service Risk",
      "body": "Different products and services carry different ML/TF risk profiles. For an MSB/PSP, the risk ladder typically runs: virtual currency dealing (highest — pseudonymous, irreversible, global); international funds transfer (high — cross-border, cash conversion possible); foreign exchange (medium-high — cash conversion); money orders and traveller's cheques (medium); domestic transfers (lower). Consultants must assess each product offered by the client, identify the specific ML/TF vulnerabilities (e.g., virtual currency lacks the traceability of bank wires; money orders are easily negotiable), and assign an inherent risk rating. Products with no natural paper trail — cash or VC — warrant enhanced controls regardless of the client type using them."
    },
    {
      "title": "Geographic Risk",
      "body": "Geographic risk assesses the ML/TF risk associated with the destinations and origins of the client's funds flows. Consultants reference several authoritative sources: (1) FATF's Jurisdictions Under Increased Monitoring (grey list) and High-Risk Jurisdictions Subject to a Call for Action (black list). (2) Transparency International's Corruption Perception Index. (3) Basel AML Index. (4) Global Affairs Canada sanctions lists. (5) FINTRAC's own country-specific guidance. Jurisdictions with weak AML/ATF frameworks, high corruption, or active UN sanctions are rated higher risk. Corridors to these jurisdictions require enhanced due diligence on the clients using them and may require transaction-level monitoring at lower thresholds than low-risk corridors. Geographic risk ratings must be updated whenever FATF updates its lists — typically three times per year."
    },
    {
      "title": "Delivery Channel Risk",
      "body": "How products are delivered to clients affects ML/TF risk. In-person delivery (the client presents at a physical location) allows face-to-face identification verification — lower risk. Online-only delivery means the MSB relies on digital identity verification tools and never sees the client — higher risk. Agent networks — where third-party agents conduct transactions on the MSB's behalf — introduce additional risk if agents are not themselves adequately trained and supervised. Mobile and app-based channels are increasingly common; their risk depends on the quality of the underlying ID verification. Consultants must assess the client's delivery channels, score each by inherent risk, and ensure the compliance program includes channel-specific controls (e.g., enhanced digital ID verification procedures for online-only channels)."
    },
    {
      "title": "Inherent vs. Residual Risk and the Control Gap",
      "body": "Inherent risk is the raw risk before any controls are applied. Residual risk is what remains after controls are in place and working. The control gap is the difference: if inherent risk is high but controls are strong and effective, residual risk may be medium. The risk assessment must document: the inherent risk rating for each risk category; the controls in place to mitigate that risk; an assessment of control effectiveness (are the controls actually working?); and the resulting residual risk rating. Where residual risk exceeds the client's defined risk appetite, a remediation action is required — either strengthen the control or formally accept the residual risk with board approval. Controls that exist on paper but are not followed in practice are not effective — actual control effectiveness must be tested, not assumed."
    },
    {
      "title": "Documenting the Risk Assessment",
      "body": "The risk assessment must be a formal written document — not a spreadsheet filled with numbers but no narrative. Required elements: (1) Executive summary — overall risk rating and key findings. (2) Methodology — how the risk factors were identified and scored. (3) Risk register — a table listing each risk category, inherent risk rating, controls, effectiveness assessment, and residual risk rating. (4) High-residual-risk items — a dedicated section describing items that exceed the risk appetite and the remediation plan. (5) Approval block — signature of the compliance officer and senior management sign-off date. (6) Review history — dates of prior reviews and summary of what changed. The risk assessment should be stored in the compliance file and be immediately retrievable for a FINTRAC examination. A risk assessment submitted to FINTRAC but not understood by the compliance officer is a red flag."
    }
  ]$sm_c04$::jsonb,
  $qz_c04$[
    {
      "question": "The four risk categories that must be covered in a FINTRAC ML/TF risk assessment are:",
      "options": ["Revenue, cost, margin, and volume", "Client, product/service, delivery channel, and geographic risks", "Regulatory, operational, reputational, and financial risks", "Staff, technology, process, and external risks"],
      "answer": 1
    },
    {
      "question": "Inherent risk is defined as:",
      "options": ["The risk that remains after controls are applied", "The raw risk before any controls are considered", "The risk identified by FINTRAC in an examination", "The risk associated with a specific client"],
      "answer": 1
    },
    {
      "question": "A client's virtual currency dealing activity is rated higher risk than domestic funds transfer because:",
      "options": ["Virtual currency involves higher transaction fees", "Virtual currency is pseudonymous and transactions are irreversible — it has less traceability than bank wires", "Domestic transfers are exempt from AML controls", "FINTRAC does not regulate virtual currency"],
      "answer": 1
    },
    {
      "question": "FATF's 'grey list' refers to:",
      "options": ["Jurisdictions with grey-market financial services", "Jurisdictions under increased monitoring for AML/ATF deficiencies", "Countries with average corruption scores", "FINTRAC's internal list of moderate-risk MSBs"],
      "answer": 1
    },
    {
      "question": "Online-only delivery channels are rated higher risk than in-person channels because:",
      "options": ["Online clients transact more frequently", "The MSB cannot conduct face-to-face ID verification and relies on digital tools", "Online channels process larger transactions", "FINTRAC exempts in-person transactions from reporting"],
      "answer": 1
    },
    {
      "question": "Where residual risk exceeds the client's risk appetite, the consultant must:",
      "options": ["Accept the risk and continue", "Recommend strengthening controls or obtaining formal board approval to accept the residual risk", "File an STR with FINTRAC", "Withdraw from the engagement"],
      "answer": 1
    },
    {
      "question": "FATF updates its jurisdictional risk lists approximately:",
      "options": ["Once every 5 years", "Three times per year", "Monthly", "Only when a new country joins FATF"],
      "answer": 1
    },
    {
      "question": "A control that exists in policy but is not followed in practice should be assessed as:",
      "options": ["Effective — the policy is what matters", "Ineffective — actual operation, not documentation, determines control effectiveness", "Partially effective if followed more than 50% of the time", "Effective if approved by senior management"],
      "answer": 1
    },
    {
      "question": "The risk assessment document must include:",
      "options": ["Only a risk register table", "Executive summary, methodology, risk register, high-residual-risk remediation plan, and approval signatures", "Only a list of high-risk clients", "The client's financial statements"],
      "answer": 1
    },
    {
      "question": "The risk assessment must be reviewed:",
      "options": ["Only at the 2-year effectiveness review", "At least annually and immediately when new products, corridors, or regulatory risk ratings change", "Every 5 years", "Only when FINTRAC requests it"],
      "answer": 1
    }
  ]$qz_c04$::jsonb,
  $res_c04$[
    {"label": "FINTRAC — Risk-Based Approach Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Compliance Program Guide (Guide 4)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng", "type": "Official Guidance"},
    {"label": "FATF — High-Risk and Other Monitored Jurisdictions", "url": "https://www.fatf-gafi.org/en/topics/high-risk-and-other-monitored-jurisdictions.html", "type": "Official Guidance"}
  ]$res_c04$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-05  CDD & EDD Framework Design
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'CDD & EDD Framework Design',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Designing tiered Customer Due Diligence and Enhanced Due Diligence procedures for MSB clients — ID verification, PEP screening, BO identification, and ongoing monitoring.',
  $sm_c05$[
    {
      "title": "CDD Framework Architecture — Tiered Approach",
      "body": "A well-designed Customer Due Diligence framework uses a tiered approach: Simplified Due Diligence (SDD) for lower-risk clients and transactions; Standard CDD for most clients; and Enhanced Due Diligence (EDD) for higher-risk clients such as PEPs, clients from high-risk jurisdictions, or clients with complex ownership structures. Each tier specifies: what information is collected; what verification methods are used; what the transaction monitoring parameters are; and how frequently the client file is reviewed. The tiered approach is calibrated to the client's risk assessment — the risk categories that drive higher risk ratings in the assessment should map directly to the triggers for EDD in the CDD framework. A CDD framework that applies standard due diligence to all clients regardless of their risk rating is not compliant with the risk-based approach."
    },
    {
      "title": "Identity Verification Thresholds and Methods",
      "body": "Consultants must design ID verification procedures that trigger at the correct PCMLTFR thresholds. For MSB clients: foreign exchange at or above $3,000 (CAD equivalent); funds transfers at or above $1,000; virtual currency at or above $1,000; money orders at or above $3,000. Acceptable verification methods: (1) Government-issued photo ID — single document showing name, DOB, photo, and unique number (passport, driver's licence). (2) Dual-process — two independent sources confirming name and either address (one source) or DOB (other source). (3) Credit file method — for clients who cannot provide physical ID. The procedure should specify exactly which documents are accepted, how to verify authenticity, what to do if the document appears altered, and how the verification is recorded."
    },
    {
      "title": "PEP Identification and Screening",
      "body": "Designing a PEP screening process requires: (1) Defining which persons qualify — current and former (within 5 years) heads of state, senior government officials, senior military, senior state-owned enterprise executives; their immediate family members; and close associates. (2) Screening mechanism — at client onboarding, ask the client directly (self-declaration) AND screen against commercial PEP databases (World-Check, Refinitiv, etc.). Do not rely on self-declaration alone. (3) Ongoing screening — re-screen existing clients periodically (at least annually) because PEP status changes. (4) Match resolution — a documented process for reviewing PEP screening hits: is the hit the same person as the client? Is the person still in the PEP look-back window? (5) EDD trigger — a confirmed PEP match must automatically trigger EDD regardless of transaction amount."
    },
    {
      "title": "Beneficial Ownership Identification",
      "body": "When the client is a corporation, partnership, or trust, beneficial ownership must be identified. Consultants should design a BO collection procedure that: (1) Distinguishes between individual clients (no BO required) and entity clients (BO required). (2) For corporations: collects a complete list of shareholders at or above 25% ownership or control. (3) For trusts: collects all trustees, settlors with retained interest, and beneficiaries. (4) For partnerships: collects all partners. (5) Specifies the verification method for BO information — typically reviewing the entity's constating documents (certificate of incorporation, shareholders agreement). (6) Specifies the timeline — BO must be collected and verified within 30 days of establishing a business relationship. (7) Triggers for re-collection — any ownership change, any regulatory change that affects thresholds."
    },
    {
      "title": "Third-Party Determination Procedure",
      "body": "At every transaction, staff must determine whether the client is acting on their own behalf or on behalf of a third party. Consultants design this as a standard step in the transaction workflow: (1) Ask the client at the time of the transaction: 'Are you conducting this transaction on your own behalf, or on behalf of another person or entity?' (2) If yes — collect third-party name, address, and relationship to the client. (3) If the client denies third-party involvement but the consultant has reasonable grounds to suspect it — document the suspicion, collect TP information anyway, and escalate for STR assessment. (4) Record keeping — third-party determination records are part of the transaction record and must be retained for 5 years. The most common gap: front-line staff skip the TP question when transactions are busy — the procedure must specify that the question is mandatory for every transaction."
    },
    {
      "title": "Enhanced Due Diligence — Design and Triggers",
      "body": "EDD must be applied automatically for foreign PEPs (no risk assessment required) and risk-based for domestic PEPs and HIOs (only if ML/TF risk is assessed as high). Consultants design EDD to include: (1) Senior management approval — a documented approval from a designated senior manager (named in the procedure) before the business relationship is established or continued. (2) Source of funds — a written description of where the funds originate (employment income, business revenue, sale of property, etc.), supported where possible by documentation. (3) Source of wealth — for high-value relationships, understanding the client's overall financial situation. (4) Enhanced ongoing monitoring — lower alert thresholds in the monitoring system for EDD clients, more frequent file reviews. (5) Periodic EDD re-approval — annually, confirm that the senior manager still approves continuing the relationship."
    },
    {
      "title": "Ongoing Monitoring and Client File Review",
      "body": "CDD is not a one-time onboarding exercise. The PCMLTFR requires ongoing monitoring of business relationships: reviewing transactions for consistency with the client's risk profile and stated purpose; updating client information when it changes; and re-screening for PEP status periodically. Consultants design a client file review schedule: High-risk clients (PEPs, high-risk jurisdiction): annual review. Medium-risk clients: every two years. Low-risk clients: every three years. At each review: confirm ID is still valid; confirm BO information is still accurate; review transaction history for anomalies; update the risk tier if warranted. Trigger-based reviews outside the schedule: any significant change in transaction pattern, any STR filed on the client, any sanctions hit, or any negative media. A client whose file has never been reviewed since onboarding is a compliance gap."
    }
  ]$sm_c05$::jsonb,
  $qz_c05$[
    {
      "question": "A tiered CDD framework applies EDD to clients who are:",
      "options": ["All new clients regardless of risk", "Clients assessed as higher-risk — such as PEPs and clients from high-risk jurisdictions", "Only clients who transact above $10,000", "Only corporate clients"],
      "answer": 1
    },
    {
      "question": "The PCMLTFR threshold for ID verification on funds transfers (remittances) is:",
      "options": ["$500", "$1,000", "$3,000", "$10,000"],
      "answer": 1
    },
    {
      "question": "The 5-year PEP look-back means:",
      "options": ["PEP screening results are valid for 5 years", "A person who held a qualifying PEP role within the last 5 years must still be treated as a PEP", "PEP records must be retained for 5 years", "PEP re-screening occurs every 5 years"],
      "answer": 1
    },
    {
      "question": "Self-declaration alone (asking the client if they are a PEP) is:",
      "options": ["Sufficient for domestic PEPs", "Insufficient — commercial PEP database screening is also required", "The recommended method for all PEP screening", "Only required for foreign PEPs"],
      "answer": 1
    },
    {
      "question": "Beneficial ownership identification is required when the client is:",
      "options": ["Any individual regardless of transaction size", "A corporation, partnership, or trust — not an individual acting on their own behalf", "Only publicly listed companies", "Only trusts with assets over $1 million"],
      "answer": 1
    },
    {
      "question": "The 25% beneficial ownership threshold means:",
      "options": ["Only shareholders owning more than 25% need be identified", "Any individual who directly or indirectly owns or controls 25% or more of the entity must be identified", "Beneficial owners receive 25% of the EDD documentation requirement", "The BO threshold applies only to foreign entities"],
      "answer": 1
    },
    {
      "question": "EDD for a foreign PEP requires which step not needed for ordinary clients?",
      "options": ["Filing an STR", "Obtaining senior management approval before or upon establishing the relationship", "Contacting FINTRAC for clearance", "Conducting a background check with the RCMP"],
      "answer": 1
    },
    {
      "question": "The third-party determination question must be asked:",
      "options": ["Only for transactions above $10,000", "At every transaction — it is mandatory regardless of amount", "Only for corporate clients", "Only when the client is a PEP"],
      "answer": 1
    },
    {
      "question": "BO information must be collected and verified within how many days of establishing a business relationship?",
      "options": ["7 days", "15 days", "30 days", "60 days"],
      "answer": 2
    },
    {
      "question": "A trigger-based client file review (outside the scheduled cycle) should be initiated when:",
      "options": ["The client requests a receipt", "A significant change in transaction pattern, an STR filing on the client, or a sanctions hit occurs", "The client changes their contact phone number", "The annual report is submitted"],
      "answer": 1
    }
  ]$qz_c05$::jsonb,
  $res_c05$[
    {"label": "FINTRAC — Client Identification Guide (Guide 11)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/Guide11/11-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — PEP Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/pep/pep-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Third-Party Determination", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/tpd-dtiers/tpd-dtiers-eng", "type": "Official Guidance"}
  ]$res_c05$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-06  Transaction Monitoring Program Design
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Transaction Monitoring Program Design',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Designing rule sets, alert workflows, and calibration methodologies for effective AML/ATF transaction monitoring at MSB and PSP clients.',
  $sm_c06$[
    {
      "title": "Monitoring Program Objectives and Regulatory Basis",
      "body": "An effective transaction monitoring program serves two regulatory functions: (1) it identifies transactions that may require threshold-triggered reporting (LCTRs, EFTRs) by aggregating amounts within the correct windows; and (2) it identifies suspicious patterns that may warrant an STR by flagging anomalies against expected client behaviour. FINTRAC does not specify exact monitoring rules but expects MSBs to have a monitoring process proportionate to their risk profile (PCMLTFR s.9(1)(c)). A monitoring program is proportionate when: it covers all transaction channels (in-person, online, agent); it applies stricter parameters to higher-risk clients and corridors; it generates alerts at a rate that is neither too low (missing suspicious activity) nor too high (creating alert fatigue that causes reviewers to dismiss genuine concerns)."
    },
    {
      "title": "Rule Development — Starting with Regulatory Triggers",
      "body": "Rule development begins with the regulatory triggers that must always be captured: (1) LCTR rule — aggregate cash received per client in a rolling 24-hour window; flag when total approaches or exceeds $10,000. (2) EFTR rule — flag any international electronic transfer at or above $10,000. (3) Travel Rule rule — flag any EFT or VC transfer at or above $1,000 to ensure originator/beneficiary information is transmitted. (4) LVCTR rule — aggregate virtual currency received per client in a rolling 24-hour window; flag at $10,000 equivalent. These regulatory-trigger rules are non-negotiable baselines. They must be implemented first, before any ML/TF-typology rules are added. If a client's system cannot enforce these basic rules automatically, manual daily review is required until the system is upgraded."
    },
    {
      "title": "ML/TF Typology Rules",
      "body": "Beyond regulatory triggers, the monitoring program should include typology-based rules derived from FINTRAC's published ML/TF indicator lists. Key typology rules for an MSB: (1) Structuring detector — flag any client who conducts three or more transactions in a 7-day period where each is between $7,500 and $9,999 (calibrated to catch deliberate avoidance of the $10,000 threshold). (2) High-risk jurisdiction rule — flag all transactions to or from FATF grey/black list countries above a lower threshold (e.g., $500). (3) Velocity rule — flag clients whose transaction frequency increases by 300% or more month-over-month without a corresponding change in stated business. (4) Dormant account rule — flag any transaction on an account that has been inactive for 90 days. (5) Round number rule — flag transactions that are exactly round numbers (e.g., $5,000.00, $10,000.00) repeatedly."
    },
    {
      "title": "Alert Calibration — Reducing False Positives",
      "body": "A monitoring system that generates excessive false positive alerts is as dangerous as one that generates too few, because reviewer alert fatigue causes genuine alerts to be dismissed. Calibration involves: (1) Reviewing 90 days of historical transactions and running the proposed rules against them — how many alerts would have been generated? What proportion were true positives? (2) Adjusting thresholds up or down to achieve an acceptable false positive rate (industry benchmark: below 95% false positives for a well-calibrated program). (3) Tuning rules by client segment — a rule threshold that is appropriate for retail remittance clients may generate excessive false positives for commercial clients with genuinely high-volume activity. (4) Documenting all calibration decisions — FINTRAC may ask why thresholds are set at specific levels; the rationale must be defensible."
    },
    {
      "title": "Alert Management and Investigation Workflow",
      "body": "The alert management workflow defines what happens after an alert is generated: (1) Alert assignment — who receives the alert? (2) Preliminary review — is this a clear false positive (e.g., a known high-volume legitimate business transacting normally)? If yes, close with documented rationale. (3) In-depth investigation — gather context: what is the client's stated occupation and purpose? What is their transaction history? Does this pattern appear in other clients? (4) Escalation — if the investigation raises suspicion, escalate to the compliance officer for STR assessment. (5) STR or close — the compliance officer decides whether to file. (6) Documentation — every alert, whether closed or escalated, is documented. Alert closure rationales must explain WHY the activity was determined to be legitimate. A pattern of closures with no documentation is a systemic gap."
    },
    {
      "title": "Program Metrics and Quality Assurance",
      "body": "A transaction monitoring program should be assessed through regular metrics: (1) Alert volume — total alerts generated per month (track trend over time). (2) Alert closure rate — what proportion of alerts are closed vs. escalated? (3) STR conversion rate — of escalated alerts, what proportion result in STR filing? (4) Time to investigate — average time from alert generation to closure or escalation. (5) Lookback coverage — has a sample of closed alerts been re-reviewed to confirm the rationale was sound? These metrics are presented to the compliance officer monthly. A consistently zero STR conversion rate (all alerts closed, never escalated) suggests calibration is too loose. A 100% escalation rate suggests calibration is too tight. The compliance officer should set benchmarks and investigate significant deviations."
    },
    {
      "title": "Program Documentation and FINTRAC Readiness",
      "body": "The transaction monitoring program must be documented in the compliance policies. At minimum, the policy should describe: what the monitoring system is (manual or automated); which channels and transaction types are covered; the rule set applied (or a reference to the rule library); the alert management workflow; escalation procedures for STR assessment; the calibration review cycle (at minimum annual); and the metrics reported to management. During a FINTRAC examination, examiners may request: the monitoring rules (to assess whether they are proportionate to the risk profile); a sample of closed alerts and their rationales; STR data to cross-reference with alerts; and the calibration review history. A monitoring program that is described in policy but has no records of alerts, investigations, or calibrations has not been operating — and that is a serious compliance finding."
    }
  ]$sm_c06$::jsonb,
  $qz_c06$[
    {
      "question": "The first rules to implement in any transaction monitoring program are:",
      "options": ["ML/TF typology-based rules from FINTRAC indicator lists", "The regulatory-trigger baselines: LCTR, EFTR, Travel Rule, and LVCTR thresholds", "Round-number flagging rules", "Dormant account rules"],
      "answer": 1
    },
    {
      "question": "A structuring detector rule flags clients who make multiple transactions each just below $10,000. This is designed to detect:",
      "options": ["Large cash transactions that require LCTR filing", "Deliberate breaking-up of transactions to avoid the $10,000 reporting threshold — a criminal offence", "Virtual currency exchanges above $1,000", "PEP-linked transactions"],
      "answer": 1
    },
    {
      "question": "Alert fatigue occurs when:",
      "options": ["Reviewers have too few alerts and become complacent", "Excessive false positive alerts cause reviewers to dismiss genuine suspicious alerts without proper investigation", "Monitoring rules are too restrictive", "The compliance officer reviews all alerts personally"],
      "answer": 1
    },
    {
      "question": "The industry benchmark for a well-calibrated monitoring program is a false positive rate below:",
      "options": ["50%", "75%", "95%", "99%"],
      "answer": 2
    },
    {
      "question": "When closing an alert as a false positive, the reviewer must:",
      "options": ["Simply mark it closed in the system", "Document the rationale explaining why the activity was determined to be legitimate", "File an STR anyway to be safe", "Obtain compliance officer approval for every closure"],
      "answer": 1
    },
    {
      "question": "A STR conversion rate of zero (no alerts ever escalated to STR filing) most likely indicates:",
      "options": ["A very clean client base", "Monitoring calibration is too loose — suspicious patterns are not being captured", "A fully effective monitoring program", "The client has no high-risk clients"],
      "answer": 1
    },
    {
      "question": "The monitoring program should apply stricter alert parameters to:",
      "options": ["All clients equally, regardless of risk", "Higher-risk clients and higher-risk corridors", "Only PEP clients", "Only clients transacting above $10,000"],
      "answer": 1
    },
    {
      "question": "Which monitoring metric signals that calibration may be too tight?",
      "options": ["Zero STR conversion rate", "100% escalation rate (all alerts escalated, none closed)", "High alert volume", "Long time to investigate"],
      "answer": 1
    },
    {
      "question": "Calibration decisions — such as why a rule threshold is set at a specific level — must be:",
      "options": ["Kept confidential from FINTRAC", "Documented with a defensible rationale", "Approved by FINTRAC before implementation", "Set by the IT department without compliance input"],
      "answer": 1
    },
    {
      "question": "A monitoring program described in policy but with no records of actual alerts, investigations, or calibrations is treated by FINTRAC as:",
      "options": ["Compliant — the policy is what matters", "A serious finding — the program has not been operating", "Partially compliant if alerts were generated in the past year", "Acceptable for small MSBs"],
      "answer": 1
    }
  ]$qz_c06$::jsonb,
  $res_c06$[
    {"label": "FINTRAC — MSB ML/TF Indicators", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Risk-Based Approach Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng", "type": "Official Guidance"}
  ]$res_c06$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-07  Sanctions & Adverse Media Screening
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Sanctions & Adverse Media Screening',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Designing a comprehensive sanctions screening program — list management, screening frequency, match resolution, Terrorist Property Reports, and adverse media integration.',
  $sm_c07$[
    {
      "title": "The Sanctions Screening Obligation",
      "body": "Sanctions screening is both a PCMLTFA obligation (Terrorist Property Reports for listed persons) and a sanctions compliance obligation under the Special Economic Measures Act (SEMA), the Justice for Victims of Corrupt Foreign Officials Act (JVCFOA), and the United Nations Act. MSBs and PSPs must not process transactions for, or hold funds of, individuals or entities designated under these regimes. Consultants must help clients understand that sanctions screening is not optional — even if FINTRAC's AML program requirements are met, failure to screen against Canadian and applicable international lists creates criminal liability. The key lists: OSFI's Consolidated List of Designated Persons (Canadian), OFAC's Specially Designated Nationals List (US dollar clearing), UN Consolidated List, and Global Affairs Canada's sanctions list."
    },
    {
      "title": "List Coverage and Update Frequency",
      "body": "The effectiveness of a sanctions program depends critically on list currency. Lists are updated frequently: the OFAC SDN list can be updated multiple times per day; OSFI's Consolidated List is updated without notice when new designations are made. A client that screens against a list downloaded monthly may process a transaction for a person designated three weeks ago — a serious sanctions violation. Consultants should design the client's screening program to use an automated feed from a reliable sanctions data provider (LexisNexis, Refinitiv World-Check, OFAC's official API) that updates the screening list in near-real-time. Manual list downloads are only acceptable for very low-volume businesses. The update frequency must be documented and tested — verify that a test designation added to a sandbox list is captured by the next screening cycle."
    },
    {
      "title": "When to Screen — Onboarding and Transaction-Level",
      "body": "A common gap in client sanctions programs is screening only at onboarding — screening the client when they first open an account but not at each subsequent transaction. This is insufficient because: (1) Designations can occur after onboarding — a client who was clean at onboarding may become designated the following week. (2) Beneficiaries in international transfers must be screened — the recipient in Nigeria or Zambia who has never been an eFinMoney client must still be screened for sanctions before funds are sent. Consultants must design the program to screen: (a) every client and all UBOs at onboarding; (b) all named parties (sender, recipient, intermediary) at the time of each transaction; and (c) the full client base periodically (at least monthly) against updated lists to catch retrospective designations."
    },
    {
      "title": "Match Resolution — True Hits vs. False Positives",
      "body": "Most screening hits are false positives — a name match that is not the designated person. The match resolution procedure must be rigorous but efficient. Steps: (1) Confirm the match details — does the date of birth, nationality, address, or other identifier match? (2) If identifiers conflict clearly — document the reason for clearing the hit and proceed. (3) If identifiers cannot rule out the match — escalate to the compliance officer immediately. (4) If the match is confirmed — freeze the funds, do not process the transaction, do not tip off the client, and file a Terrorist Property Report with FINTRAC within 30 days (and as soon as practicable). (5) Document every hit, including cleared false positives — FINTRAC may review screening records. A program with thousands of transactions and no recorded hits is a red flag — either screening is not occurring or hits are being cleared without documentation."
    },
    {
      "title": "Terrorist Property Reports",
      "body": "A Terrorist Property Report (TPR) is required under s.7.1 of the PCMLTFA whenever a reporting entity: holds property (funds or other assets) belonging to a person or entity designated under the Criminal Code, SEMA, JVCFOA, or the United Nations Act; or controls property that is directly or indirectly owned or controlled by such a person or entity. Unlike STRs and LCTRs, there is no dollar threshold and no grace period — the TPR must be filed as soon as practicable after the entity becomes aware of the property. Simultaneously: the funds must be frozen (do not transfer, release, or allow the client to withdraw); the entity must notify OSFI; and the client must not be tipped off. The TPR is filed through the F2R portal. Failure to file a TPR is among the most serious PCMLTFA violations."
    },
    {
      "title": "Adverse Media Screening",
      "body": "Adverse media screening — searching for negative news about a client — is not explicitly required by the PCMLTFA but is considered a best practice for EDD clients and a component of PEP-related ongoing monitoring. Adverse media sources include: court records, news databases (Dow Jones Factiva, LexisNexis), government enforcement actions, and social media. For consulting clients, recommend adverse media screening: at EDD onboarding for PEPs and high-risk clients; annually for EDD clients as part of the file review; and as a trigger-based control when transaction patterns change significantly. The screening must be documented — what terms were searched, what sources were used, what was found, and how it was assessed. A finding of adverse media does not automatically require an STR — it is a risk factor that must be weighed in context."
    },
    {
      "title": "Sanctions Program Documentation and Testing",
      "body": "The sanctions program must be documented in a written sanctions screening policy covering: which lists are screened; how and how often lists are updated; when screening occurs (onboarding vs. transaction-level); the match resolution procedure; the TPR filing procedure; and the documentation retention period (5 years). The program must be tested at least annually: (1) Run a sample of known designated persons through the screening system and confirm they are flagged. (2) Verify that the list update mechanism is working by checking the timestamp of the last update against the expected frequency. (3) Review a sample of cleared hits and confirm documentation is adequate. (4) Confirm that the TPR filing procedure is understood by the compliance officer and the relevant operations staff. Test results must be documented and any gaps remediated immediately."
    }
  ]$sm_c07$::jsonb,
  $qz_c07$[
    {
      "question": "Which of the following sanctions lists must a Canadian MSB screen against?",
      "options": ["OSFI Consolidated List only", "OFAC SDN List only", "OSFI Consolidated List, OFAC SDN List, UN Consolidated List, and Global Affairs Canada list", "No list — sanctions screening is voluntary in Canada"],
      "answer": 2
    },
    {
      "question": "Screening only at client onboarding is insufficient because:",
      "options": ["It takes too long", "Designations can be made after onboarding, and transaction beneficiaries (who may never have been clients) must also be screened", "FINTRAC requires monthly full-file screening only", "Onboarding screens are more expensive than transaction-level screens"],
      "answer": 1
    },
    {
      "question": "A Terrorist Property Report (TPR) must be filed when:",
      "options": ["Any transaction exceeds $10,000", "The MSB holds or controls property belonging to a designated person under SEMA, JVCFOA, the UN Act, or the Criminal Code", "A client is identified as a PEP", "An STR is filed"],
      "answer": 1
    },
    {
      "question": "When a TPR is filed, the MSB must also:",
      "options": ["Inform the client that a report was filed", "Freeze the funds, not release them, and notify OSFI", "Transfer the funds to a government escrow account", "Close the client's account within 30 days"],
      "answer": 1
    },
    {
      "question": "A Terrorist Property Report has a filing deadline of:",
      "options": ["30 calendar days", "5 business days", "24 hours", "As soon as practicable — there is no fixed grace period"],
      "answer": 3
    },
    {
      "question": "An automated sanctions list feed from a commercial provider (e.g., World-Check) is preferable to manual monthly downloads because:",
      "options": ["Commercial providers are cheaper", "Lists are updated multiple times per day — a monthly download misses designations made in between", "FINTRAC requires commercial list providers", "Manual downloads are prohibited under the PCMLTFA"],
      "answer": 1
    },
    {
      "question": "A screening hit that cannot be cleared by comparing identifiers should be:",
      "options": ["Cleared as a false positive to avoid delays", "Escalated to the compliance officer immediately, with funds frozen pending investigation", "Filed as an STR automatically", "Reported to the Bank of Canada within 24 hours"],
      "answer": 1
    },
    {
      "question": "Adverse media screening is considered best practice for which clients?",
      "options": ["All clients equally at every transaction", "EDD clients (PEPs and high-risk clients) at onboarding and annually", "Only clients from FATF grey-listed countries", "Only corporate clients"],
      "answer": 1
    },
    {
      "question": "A sanctions program with thousands of processed transactions and no recorded screening hits is:",
      "options": ["Evidence of a very clean client base", "A red flag — either screening is not occurring or hits are being cleared without documentation", "Compliant if the compliance officer confirms no hits visually", "Acceptable for low-risk MSBs"],
      "answer": 1
    },
    {
      "question": "Annual sanctions program testing should confirm:",
      "options": ["That all clients have been onboarded this year", "That known designated persons are flagged by the system and that the list update mechanism is working", "That the compliance officer has read the sanctions policy", "That no false positives occurred during the year"],
      "answer": 1
    }
  ]$qz_c07$::jsonb,
  $res_c07$[
    {"label": "FINTRAC — Guide 5: Reporting Listed Persons", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/Guide5/5-eng", "type": "Official Guidance"},
    {"label": "OSFI — Consolidated Designated Persons List", "url": "https://www.osfi-bsif.gc.ca/en/security-safety/consolidated-designated-persons-list", "type": "Official Guidance"},
    {"label": "Global Affairs Canada — Consolidated Sanctions List", "url": "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx", "type": "Official Guidance"}
  ]$res_c07$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-08  Safeguarding Program Design (RPAA)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Safeguarding Program Design (RPAA)',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Designing a BoC RPAA-compliant safeguarding program for PSP clients — eligible account selection, segregation controls, daily reconciliation, and shortfall response.',
  $sm_c08$[
    {
      "title": "Understanding the Safeguarding Obligation",
      "body": "The Bank of Canada's safeguarding obligation requires every registered PSP to protect end-user funds against the risk of loss in the event of the PSP's insolvency. End-user funds are funds the PSP holds in connection with performing a retail payment activity — from the moment of receipt until the payment is delivered and confirmed. Designing a safeguarding program for a consulting client begins with mapping the client's payment cycle: at what point does the client first receive end-user funds? At what point does the obligation end? For a remittance business like most eFinMoney consulting clients, the safeguarding period spans from receipt of the sender's funds to confirmation of delivery to the recipient. All funds in that window are end-user funds requiring safeguarding protection."
    },
    {
      "title": "Selecting Eligible Safeguarding Accounts",
      "body": "An eligible account for RPAA safeguarding is a deposit account held at a Canadian financial institution that is a member of the Canada Deposit Insurance Corporation (CDIC) or an equivalent provincial deposit insurer. Government of Canada securities and provincial government securities are also eligible. Consultants must help clients: (1) Identify and open a dedicated safeguarding account at a CDIC-member bank — this cannot be the operating account used for salaries, rent, or other expenses. (2) Confirm in writing (via a bank letter or account agreement) that the account is designated as a client safeguarding account. (3) Assess whether CDIC deposit coverage limits create a gap — CDIC covers up to $100,000 per depositor per category, but a PSP with $500,000 in end-user funds in a single account may need multiple banks or eligible government securities to cover the gap."
    },
    {
      "title": "The Commingling Prohibition in Practice",
      "body": "The commingling prohibition is absolute: end-user funds must never be deposited into the PSP's operating accounts, even temporarily. In practice, this creates a common operational challenge: client payment processors or banking partners may route received funds into the PSP's settlement account (which is often the operating account) before the PSP sweeps them to the safeguarding account. This creates a brief commingling period that violates the RPAA. Consultants must redesign the payment flow so that end-user funds are routed directly into the safeguarding account or — where the PSP's banking arrangement does not allow this — document the minimum-time-delay sweep procedure and seek BoC guidance. The safeguarding account should not be used to pay operating expenses under any circumstances."
    },
    {
      "title": "Daily Reconciliation — Design and Controls",
      "body": "The daily reconciliation is the primary internal control for safeguarding compliance. Consultants design the reconciliation procedure as follows: (1) Each business day, the operations/finance team queries the transaction system for all end-user funds outstanding as of close of business — funds received but not yet delivered. (2) The safeguarding account balance for the same date is retrieved from the bank. (3) The two figures are compared. Safeguarding account balance ≥ total outstanding end-user funds = compliant. Safeguarding account < total outstanding end-user funds = shortfall — immediate escalation required. (4) The reconciliation result is recorded in a ledger (spreadsheet or system) with the date, both figures, and the name of the person who performed the reconciliation. (5) A compliance officer or senior manager reviews and approves the reconciliation daily or weekly."
    },
    {
      "title": "Shortfall Response Procedure",
      "body": "A shortfall — where the safeguarding account holds less than the total outstanding end-user funds — is a breach of the RPAA safeguarding obligation and must be treated as an emergency. The shortfall response procedure: (1) Immediate escalation to the compliance officer and CFO as soon as the shortfall is detected. (2) Determine the cause — was it a timing issue (funds not yet swept to safeguarding), an accounting error, or an actual fund loss? (3) If a timing issue — sweep funds to the safeguarding account immediately and document the correction. (4) If an actual fund loss — escalate to the CEO and board, engage legal counsel, and assess whether the shortfall constitutes a notifiable incident to the Bank of Canada. (5) Document the entire response. Repeated shortfalls — even small timing differences — suggest a systemic control failure that must be remediated."
    },
    {
      "title": "Safeguarding Policy Documentation",
      "body": "The written safeguarding policy must cover: (1) The definition of end-user funds and the payment cycle during which they are subject to safeguarding. (2) The eligible safeguarding account(s) — institution names, account numbers, and the basis for eligibility. (3) The commingling prohibition — an explicit statement that operating funds must not be deposited into the safeguarding account and vice versa. (4) The daily reconciliation procedure — who performs it, what system is used, how discrepancies are resolved. (5) The shortfall response escalation chain. (6) The approval chain for withdrawals from the safeguarding account (only for completing payments to recipients or returning funds to end users). (7) The annual report reporting obligations. The policy must be approved by senior management and reviewed at least annually."
    },
    {
      "title": "Annual Report Safeguarding Disclosures",
      "body": "The BoC annual report (due March 31) requires PSPs to disclose safeguarding information from the preceding calendar year. Consultants supporting the annual report should help clients prepare: (1) The average value of end-user funds held over the reporting year — computed as the average of the daily closing safeguarding obligation across all 365 days. (2) The highest single-day value during the year. (3) The name(s) of the eligible institution(s) holding safeguarding accounts. (4) Confirmation that no commingling occurred. (5) Confirmation that daily reconciliations were performed and documented. (6) Disclosure of any safeguarding shortfall — the duration, cause, and resolution. The accuracy of this attestation is critical — a senior officer signs it. Prepare it from the daily reconciliation ledger, not from memory."
    }
  ]$sm_c08$::jsonb,
  $qz_c08$[
    {
      "question": "End-user funds are subject to the safeguarding obligation from:",
      "options": ["The moment the client opens an account", "Receipt by the PSP until the payment is delivered and confirmed to the recipient", "The moment the annual report is filed", "When the BoC designates the funds as safeguarded"],
      "answer": 1
    },
    {
      "question": "An eligible safeguarding account must be held at:",
      "options": ["Any bank in the PSP's home country", "A CDIC-member Canadian institution or an institution covered by a provincial deposit insurer", "The Bank of Canada directly", "An OSFI-regulated institution regardless of deposit insurance"],
      "answer": 1
    },
    {
      "question": "CDIC coverage up to $100,000 per depositor may create a gap for PSPs because:",
      "options": ["CDIC does not cover client funds", "A PSP holding $500,000 in end-user funds in a single account may exceed CDIC's limit, leaving the excess unprotected", "CDIC coverage resets monthly", "Safeguarding accounts are exempt from CDIC"],
      "answer": 1
    },
    {
      "question": "The commingling prohibition means that end-user funds must never:",
      "options": ["Be held at more than one institution", "Be deposited into the PSP's operating accounts", "Be held for more than 30 days", "Be reported in the annual report"],
      "answer": 1
    },
    {
      "question": "A shortfall in the daily reconciliation (safeguarding account < total outstanding) requires:",
      "options": ["Correction at the next monthly reconciliation", "Immediate escalation to the compliance officer and CFO, cause determination, and documentation", "Waiting for the next banking day to see if the shortfall corrects itself", "Filing an LCTR with FINTRAC"],
      "answer": 1
    },
    {
      "question": "Funds may only be withdrawn from the safeguarding account for:",
      "options": ["Any business purpose with CFO approval", "Completing payments to recipients or returning funds to end users — not for operations", "Investment in non-government securities", "Paying the annual RPAA registration fee"],
      "answer": 1
    },
    {
      "question": "The daily reconciliation record must include:",
      "options": ["Only the total outstanding end-user funds", "The date, total outstanding end-user funds, safeguarding account balance, any discrepancy, and the name of the reconciler", "Only the safeguarding account statement", "The names of all individual end users with outstanding transactions"],
      "answer": 1
    },
    {
      "question": "The BoC annual report safeguarding disclosure should be prepared from:",
      "options": ["The compliance officer's memory of the year's activity", "The daily reconciliation ledger — the authoritative record of safeguarding activity throughout the year", "The PSP's income statement", "The year-end bank statement only"],
      "answer": 1
    },
    {
      "question": "A safeguarding shortfall that repeats across multiple reconciliations suggests:",
      "options": ["A normal timing pattern", "A systemic control failure requiring immediate remediation", "CDIC coverage limits being exceeded", "An issue with the annual report"],
      "answer": 1
    },
    {
      "question": "The safeguarding policy must be approved by:",
      "options": ["FINTRAC", "The Bank of Canada before implementation", "Senior management, with annual review", "The PSP's external auditor"],
      "answer": 2
    }
  ]$qz_c08$::jsonb,
  $res_c08$[
    {"label": "BoC — Safeguarding of End-User Funds Guideline", "url": "https://www.bankofcanada.ca/wp-content/uploads/2024/02/safeguarding-end-user-funds.pdf", "type": "Official Guidance"},
    {"label": "BoC — Safeguarding At a Glance", "url": "https://www.bankofcanada.ca/wp-content/uploads/2025/02/Safeguarding-of-end-user-funds-At-a-glance.pdf", "type": "Official Guidance"},
    {"label": "RPAA — Full Text", "url": "https://laws-lois.justice.gc.ca/eng/acts/R-8.4/", "type": "Statute"}
  ]$res_c08$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-09  ORM & Incident Response Program Design
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'ORM & Incident Response Program Design',
  'compliance', 'consulting', false, 12, 60, 75,
  'Consulting staff',
  'Building an ORM framework and incident response program for PSP clients — risk register design, BCP, incident classification, 24h/72h BoC notification workflow, and tabletop exercises.',
  $sm_c09$[
    {
      "title": "ORM Framework Design — Governance First",
      "body": "Before writing any ORM policy, consultants must establish governance: who owns the ORM framework? The BoC's ORM guideline expects the board and senior management to be accountable for ORM. Practically, consultants should: (1) Present the ORM mandate to the board — a board resolution establishing that the board oversees ORM, sets the risk appetite, and receives periodic ORM reports. (2) Designate a senior operational risk owner — typically the COO or CTO for technology risks, the CFO for financial operational risks, and the compliance officer for regulatory ORM risks. (3) Define the reporting structure — how often does the risk owner report to the board? What triggers an emergency board notification? Governance established first prevents ORM from becoming a compliance-team-only exercise disconnected from actual operational decisions."
    },
    {
      "title": "Building the Risk Register",
      "body": "The risk register is the living document at the heart of the ORM framework. Consultants build it by facilitating risk identification workshops with the client's operational leads: technology, finance, compliance, customer service, and senior management. For each identified risk: (1) Assign a risk ID and category (technology, people, process, external). (2) Write a risk statement ('The risk that [event] occurs due to [cause] resulting in [impact]'). (3) Score inherent likelihood (1=rare to 5=almost certain) and inherent impact (1=negligible to 5=catastrophic). (4) List existing controls. (5) Score control effectiveness (1=ineffective to 5=very effective). (6) Calculate residual risk = inherent risk score × (1 – control effectiveness adjustment). (7) Compare to risk appetite; flag items that exceed it. The register should be reviewed quarterly and updated at least annually."
    },
    {
      "title": "Business Continuity Plan Design",
      "body": "The BCP documents how critical payment operations will continue — or recover within defined timeframes — following a disruptive event. Key design steps: (1) Define critical functions — which payment operations must continue? (Sending remittances, processing inbound payments, customer refunds.) (2) Set Recovery Time Objectives (RTO) for each critical function — the maximum acceptable downtime. (3) Set Recovery Point Objectives (RPO) — the maximum acceptable data loss. (4) Design alternate operating procedures for each failure scenario: primary system down, banking partner unavailable, key staff unavailable. (5) Write a communications plan: who notifies clients? What message is sent? Who contacts the banking partner? Who contacts the BoC if the disruption is notifiable? (6) Identify the BCP owner and succession — who leads BCP execution if the primary BCP owner is unavailable?"
    },
    {
      "title": "Incident Classification — What Requires BoC Notification?",
      "body": "Designing a clear incident classification scheme is the most practically important step in the incident response program. Not every outage requires BoC notification — but failing to notify when required is a violation. The classification framework: (1) Level 1 — Minor: service degradation under 2 hours, no impact on end-user funds, no client data exposure. Internal response only. (2) Level 2 — Significant: service disruption 2–24 hours, or any event exposing end-user funds to risk, or any cybersecurity breach affecting client data. Internal response + compliance officer assessment of BoC notification obligation. (3) Level 3 — Notifiable: any incident that materially impairs payment activities, exposes end-user funds, involves a cybersecurity breach with data exfiltration, or meets BoC criteria. Mandatory BoC notification — 24 hours (initial) and 72 hours (detailed). A written classification table with worked examples reduces classification ambiguity when staff are under pressure."
    },
    {
      "title": "The 24-Hour Initial Notification — Design and Workflow",
      "body": "The 24-hour window for initial BoC incident notification begins when the PSP becomes aware of the incident. 'Becomes aware' means when any staff member with the authority to act discovers the incident — not when the compliance officer is eventually informed. The notification workflow must therefore move fast: (1) Any staff member who discovers a potential Level 3 incident immediately notifies their manager AND the compliance officer simultaneously, by phone, not email. (2) The compliance officer assesses classification within 1 hour. (3) If notifiable: the compliance officer prepares the initial notification using the May 2025 Step-by-Step Guide template in PSPConnect. The initial notification does not require complete information — it is a notice of awareness with the facts known at the time. (4) The notification is reviewed and approved by the CEO (or designated senior manager) and submitted in PSPConnect. (5) The submission timestamp is retained as evidence of timely notification."
    },
    {
      "title": "The 72-Hour Detailed Notification",
      "body": "Within 72 hours of becoming aware of the incident, the PSP must submit a detailed notification to the BoC through PSPConnect. The detailed notification must include: a full description of the incident (what happened, when, and how); the impact on payment operations (volume of affected transactions, dollar value of affected end-user funds); the root cause, if known; containment and recovery measures taken; the current status of the incident; and an initial remediation plan. The 72-hour detailed notification is the BoC's primary tool for understanding the risk the incident poses to the broader payment ecosystem. Consultants should prepare the client with a template for the detailed notification that can be filled in under time pressure. Delaying the detailed notification because information is still being gathered is unacceptable — file with the best information available and submit a supplemental update if the root cause becomes clearer later."
    },
    {
      "title": "Tabletop Exercise Design and Delivery",
      "body": "A tabletop exercise tests the incident response plan without actually disrupting operations. Consultants design exercises by: (1) Selecting a realistic scenario — for a remittance PSP, common scenarios include: the banking API provider goes down for 36 hours; a ransomware attack encrypts the transaction database; a staff member inadvertently exposes client data by emailing a transaction log to the wrong address. (2) Running the scenario through the incident classification table — is this a Level 3 notifiable incident? (3) Walking the team through the notification workflow: who calls whom? Who has the PSPConnect credentials? Where is the template? (4) Identifying gaps — common gaps found in tabletops: the compliance officer's PSPConnect login credentials are unknown; the initial notification template has never been located; no one knows the BoC's contact information for the notification. (5) Documenting findings and assigning remediation owners."
    },
    {
      "title": "Post-Incident Review and Root Cause Analysis",
      "body": "After every Level 2 or Level 3 incident, a formal post-incident review must be conducted and documented. The review should cover: (1) Incident timeline — from first detection to resolution, at what time did each action occur? (2) Was the incident classified correctly and promptly? (3) Was BoC notification timely (within 24h and 72h)? (4) Root cause analysis — what was the fundamental cause of the incident? (5) Lessons learned — what would have worked better? (6) Action items — specific remediation steps with owners and target dates. The post-incident review report should be provided to senior management. For notifiable incidents, the BoC may follow up asking for the root cause and remediation plan — the post-incident review is the source document. A PSP that experiences repeated incidents without learning from them will attract enhanced BoC supervision."
    }
  ]$sm_c09$::jsonb,
  $qz_c09$[
    {
      "question": "ORM governance should first establish:",
      "options": ["The risk register", "Board accountability for ORM, risk appetite, and the reporting structure from risk owners to the board", "The incident classification table", "The IT department's responsibility for all ORM"],
      "answer": 1
    },
    {
      "question": "A risk register risk statement should be structured as:",
      "options": ["'The risk that [event] occurs due to [cause] resulting in [impact]'", "A single word describing the risk category", "A list of past incidents", "A score only — no narrative needed"],
      "answer": 0
    },
    {
      "question": "Recovery Time Objective (RTO) is defined as:",
      "options": ["The maximum acceptable data loss after a disruption", "The maximum acceptable downtime for a critical function", "The time required to notify the BoC after an incident", "The number of hours required to restore a backup"],
      "answer": 1
    },
    {
      "question": "Initial BoC incident notification must occur within:",
      "options": ["1 hour of detection", "12 hours of detection", "24 hours of becoming aware of the incident", "72 hours of becoming aware of the incident"],
      "answer": 2
    },
    {
      "question": "Detailed BoC incident notification must occur within:",
      "options": ["24 hours", "48 hours", "72 hours", "7 business days"],
      "answer": 2
    },
    {
      "question": "The 24-hour notification clock begins when:",
      "options": ["The compliance officer is notified", "Any staff member with authority to act becomes aware of the incident", "The banking partner confirms the outage", "The BoC sends an enquiry"],
      "answer": 1
    },
    {
      "question": "The initial 24-hour notification to the BoC:",
      "options": ["Requires complete root cause analysis before submission", "Does not require complete information — it is a notice of awareness with facts known at the time", "Can be submitted by email to the BoC", "Only applies to cybersecurity incidents"],
      "answer": 1
    },
    {
      "question": "A common gap found in tabletop exercises is:",
      "options": ["The compliance officer filing too many notifications", "Staff not knowing PSPConnect credentials or where the notification template is", "The BCP being too detailed", "The board being too involved in incident response"],
      "answer": 1
    },
    {
      "question": "The post-incident review report should be provided to:",
      "options": ["FINTRAC only", "Senior management, and may be requested by the BoC for notifiable incidents", "Only the compliance officer and kept confidential", "The affected clients as part of the notification"],
      "answer": 1
    },
    {
      "question": "A PSP that experiences repeated incidents without conducting post-incident reviews will likely:",
      "options": ["Receive a clean BoC examination report", "Attract enhanced BoC supervisory attention", "Be exempt from future notification obligations", "Qualify for reduced annual registration fees"],
      "answer": 1
    },
    {
      "question": "Which scenario would most clearly qualify as a Level 3 notifiable incident?",
      "options": ["A 30-minute API slowdown with no failed transactions", "A ransomware attack that encrypts the transaction database and freezes all outbound payments", "A staff member calling in sick", "A minor UI bug on the client portal"],
      "answer": 1
    },
    {
      "question": "Delaying the 72-hour detailed BoC notification because root cause analysis is incomplete is:",
      "options": ["Acceptable — accuracy is more important than timeliness", "Not acceptable — file with the best available information and supplement later", "Permitted for 30 additional days under the RPAA", "Only allowed if the compliance officer is unavailable"],
      "answer": 1
    }
  ]$qz_c09$::jsonb,
  $res_c09$[
    {"label": "BoC — ORM & Incident Response Guideline", "url": "https://www.bankofcanada.ca/wp-content/uploads/2024/02/operational-risk-and-incident-response.pdf", "type": "Official Guidance"},
    {"label": "BoC — ORM At a Glance", "url": "https://www.bankofcanada.ca/wp-content/uploads/2025/02/Operational-risk-and-incident-response-At-a-glance.pdf", "type": "Official Guidance"},
    {"label": "BoC — Incident Step-by-Step Guide (May 2025)", "url": "https://www.bankofcanada.ca/wp-content/uploads/2025/05/how-complete-incident-step-by-step-guide.pdf", "type": "Official Guidance"},
    {"label": "RPAA — Full Text", "url": "https://laws-lois.justice.gc.ca/eng/acts/R-8.4/", "type": "Statute"}
  ]$res_c09$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- C-10  Regulatory Examination Preparation
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Regulatory Examination Preparation',
  'compliance', 'consulting', false, 12, 45, 75,
  'Consulting staff',
  'Preparing MSB and PSP clients for FINTRAC and Bank of Canada compliance examinations — pre-exam readiness reviews, document preparation, common findings, and examination conduct.',
  $sm_c10$[
    {
      "title": "FINTRAC Examination Types and Triggers",
      "body": "FINTRAC conducts two types of compliance examinations: desk-based (remote) and on-site. Desk-based examinations begin with an information request letter asking the MSB to submit compliance policies, a risk assessment, transaction data for a specified period, training records, and FINTRAC reporting logs. On-site examinations add in-person interviews of the compliance officer and staff, physical inspection of records, and direct system demonstrations. Examination triggers include: routine risk-based scheduling (FINTRAC prioritises higher-risk entities); a complaint from the public or law enforcement; a pattern of suspicious or unusual FINTRAC reports from the entity; or an anomaly in the entity's registration. Consultants should advise clients to treat every FINTRAC examination as a potential on-site — preparation for the more demanding scenario ensures readiness for both."
    },
    {
      "title": "BoC Examination Types and Triggers",
      "body": "The Bank of Canada's supervisory approach for PSPs includes both questionnaire-based reviews (similar to desk-based examinations) and in-person examinations. BoC examinations assess compliance with all four RPAA pillars: registration and reporting, safeguarding, ORM, and incident response. Triggers for enhanced BoC supervision: a pattern of late or incomplete annual reports; a notified incident that raised concerns about the PSP's controls; a tip from a client or counterparty; or a risk profile that warrants proactive review. Unlike FINTRAC, which has been examining MSBs since 2001, the BoC's PSP examination program is new (beginning in 2024–2025) — consultants should help clients understand that examination expectations may evolve as the BoC builds its supervisory practice. The BoC's published supervisory framework is the authoritative reference."
    },
    {
      "title": "Pre-Examination Readiness Review",
      "body": "When a client receives an examination notification, consultants are often engaged to conduct a rapid pre-examination readiness review. The review covers: (1) All five compliance program elements — are they documented, current, and operational? (2) The transaction sample — what would a FINTRAC examiner find if they reviewed the last 12 months of transactions for LCTR, EFTR, and STR compliance? Pull a sample now and test it. (3) Client identification records — are ID records complete for all transactions at threshold? Any missing records should be noted; if they can be obtained retroactively (client is still active), do so. (4) Training records — are they complete and does each required staff member have a current training record? (5) The risk assessment — is it dated within the last 12 months? Is it specific to the client's operations? (6) Any prior examination findings — have they been remediated?"
    },
    {
      "title": "Document Preparation and Organisation",
      "body": "A disorganised document production delays examinations and signals poor compliance culture. Consultants should prepare a document binder (physical or digital) with: Tab 1 — Current compliance policies and procedures (all, dated, version-controlled). Tab 2 — Risk assessment (current version + prior versions). Tab 3 — Training records (all staff, all modules, pass/fail, dates). Tab 4 — FINTRAC reporting log (all STRs, LCTRs, EFTRs filed in the examination period — with submission confirmation numbers). Tab 5 — Client identification samples (a pre-selected clean sample, properly documented). Tab 6 — Monitoring program documentation (rule set, sample alerts and their resolutions). Tab 7 — Effectiveness review (most recent, with management response and remediation status). Tab 8 — Correspondence — all prior FINTRAC or BoC correspondence. This structure matches FINTRAC's standard examination request and allows efficient response."
    },
    {
      "title": "Common FINTRAC Examination Findings",
      "body": "Based on FINTRAC's published compliance trends and practitioner experience, the most common findings in MSB examinations are: (1) Failure to file an LCTR — most often because the 24-hour aggregation rule was not applied. (2) Incomplete client identification — ID not obtained at the $3,000 threshold for foreign exchange, or the dual-process method poorly executed. (3) Missing third-party determination — the TP question not asked or not documented. (4) STR filed late — beyond the 30-day window from when reasonable grounds arose. (5) Compliance program deficiencies — a generic policy not tailored to the entity's operations. (6) Outdated risk assessment — not reviewed since program inception, missing new products or corridors. (7) Training gaps — staff who have not received required training, or no training records. Consultants can use this list as a pre-examination diagnostic checklist."
    },
    {
      "title": "Common BoC Examination Findings",
      "body": "BoC PSP examination expectations are based on the published guidelines and the BoC's supervisory framework. Anticipated common findings: (1) Safeguarding — daily reconciliation not performed or not documented; shortfalls not escalated; operating funds commingled temporarily. (2) ORM — risk register exists on paper but has not been updated since program inception; BCP untested. (3) Incident response — no written classification table; no notification workflow; compliance officer does not know PSPConnect login credentials. (4) Annual report — submitted late; safeguarding disclosures based on estimates rather than daily reconciliation records. (5) Significant change — change implemented without BoC pre-notification. Consultants who have resolved these gaps before the examination avoid the most common findings entirely."
    },
    {
      "title": "Examination Conduct — Principles for the Client",
      "body": "How a client behaves during an examination affects the outcome. Key principles: (1) Cooperate fully — answer questions accurately and completely. Do not withhold information that was not specifically requested if it is material to the examination scope. (2) Correct the record — if a prior answer was inaccurate, correct it promptly. (3) Do not speculate — if you do not know the answer, say so and offer to follow up with documentation. Do not guess at regulatory requirements. (4) Involve the right people — the compliance officer should be the primary contact; do not allow staff without full compliance knowledge to answer examiner questions without guidance. (5) Receive the findings constructively — the preliminary findings letter is an opportunity to clarify facts before the final report. Respond professionally and substantively. (6) Post-examination — commit to a realistic remediation timeline and meet it. The next examination will check whether prior findings were addressed."
    }
  ]$sm_c10$::jsonb,
  $qz_c10$[
    {
      "question": "FINTRAC conducts which types of compliance examinations?",
      "options": ["Only on-site examinations announced 30 days in advance", "Desk-based (remote) and on-site examinations, both announced and unannounced", "Only annual audits by appointment", "Only examinations triggered by client complaints"],
      "answer": 1
    },
    {
      "question": "Consultants should advise clients to prepare for a FINTRAC examination as if it will be:",
      "options": ["A brief phone call with the compliance officer", "An on-site examination — the most demanding scenario — to ensure readiness for both types", "A review of only the STR filings", "A random sample of 10 transactions"],
      "answer": 1
    },
    {
      "question": "The most common FINTRAC examination finding related to LCTRs is:",
      "options": ["Filing too many LCTRs", "Failure to apply the 24-hour aggregation rule, resulting in missed LCTR filings", "Filing LCTRs in the wrong currency", "Filing LCTRs more than 30 days after the transaction"],
      "answer": 1
    },
    {
      "question": "During an examination, a staff member does not know the answer to an examiner's question. They should:",
      "options": ["Guess based on what seems most compliant", "Say they do not know and offer to follow up with documentation", "Refer the examiner to the external legal counsel immediately", "Decline to answer without the compliance officer present"],
      "answer": 1
    },
    {
      "question": "The document binder for a FINTRAC examination should include:",
      "options": ["The client's financial statements only", "Current policies, risk assessment, training records, FINTRAC reporting log, client ID samples, monitoring records, and effectiveness review", "Only documents specifically requested in the examination letter", "Only records from the past 30 days"],
      "answer": 1
    },
    {
      "question": "A common BoC PSP examination finding related to safeguarding is:",
      "options": ["Over-disclosure in the annual report", "Daily reconciliation not performed or not documented; or shortfalls not escalated", "Using too many eligible accounts", "Holding end-user funds for too short a period"],
      "answer": 1
    },
    {
      "question": "The preliminary findings letter from FINTRAC after an examination is:",
      "options": ["The final, unappealable penalty notice", "An opportunity to clarify facts and provide additional context before the final report is issued", "A request for more transaction data", "A notice of automatic licence suspension"],
      "answer": 1
    },
    {
      "question": "A prior examination finding that has not been remediated by the time of the next examination is treated as:",
      "options": ["A new finding, treated the same as first-time findings", "A repeated finding — the most serious category because it demonstrates knowing non-compliance", "No longer relevant if more than 2 years have passed", "Resolved automatically if a remediation plan was submitted"],
      "answer": 1
    },
    {
      "question": "The BoC's PSP examination program began in approximately:",
      "options": ["2001 alongside FINTRAC's MSB examinations", "2019", "2024–2025, following the RPAA coming into force", "2015 under the Payments Clearing and Settlement Act"],
      "answer": 2
    },
    {
      "question": "What is the most effective pre-examination preparation a consultant can perform?",
      "options": ["Shredding records that show compliance gaps", "A pre-examination readiness review that samples transactions, tests client ID records, checks training logs, and reviews prior findings", "Submitting all outstanding FINTRAC reports before the examination begins", "Advising the client to reschedule the examination"],
      "answer": 1
    }
  ]$qz_c10$::jsonb,
  $res_c10$[
    {"label": "FINTRAC — Compliance Examination Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/cpf/cpf-eng.asp", "type": "Official Guidance"},
    {"label": "BoC — Supervisory Framework for PSPs", "url": "https://www.bankofcanada.ca/core-functions/retail-payments-supervision/supervisory-framework-registration/", "type": "Official Guidance"},
    {"label": "BoC — Supervisory Policies and Guidelines", "url": "https://www.bankofcanada.ca/core-functions/retail-payments-supervision/information-for-payment-service-providers/retail-payments-supervision-supervisory-policies-and-guidelines/", "type": "Official Guidance"}
  ]$res_c10$::jsonb,
  '[]'::jsonb
);
