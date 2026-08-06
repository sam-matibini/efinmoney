-- ==============================================================
-- Phase 3: Full BoC RPAA mandatory course content
-- All facts trace to RPAA statute (laws-lois.justice.gc.ca/eng/acts/R-8.4)
-- and Bank of Canada published guidelines (bankofcanada.ca).
-- Key numbers: 24h initial incident notice, 72h detailed, March 31 annual
-- report, $2,500 initial registration fee, 25% BO threshold (via PCMLTFA).
--
-- R-01  Bank of Canada Registration & Reporting   — UPDATE 8L 12Q
-- R-02  RPAA Compliance Gap Analysis              — UPDATE 8L 12Q
-- R-03  RPAA Policies & Procedures (ORM)          — UPDATE 9L 12Q
-- R-04  RPAA Role-Based Employee Training         — UPDATE 7L 10Q
-- R-05  AML & Transaction Monitoring Controls     — UPDATE 8L 12Q
-- R-06  Vendor Management & Data Security         — UPDATE 8L 12Q
-- R-07  Financial Crime & Safeguarding Audits     — UPDATE 9L 13Q
-- ==============================================================

-- ---------------------------------------------------------------
-- R-01  Bank of Canada Registration & Reporting
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'All staff',
  study_materials = $sm_r01$[
    {
      "title": "The Retail Payment Activities Act — Why It Was Created",
      "body": "The Retail Payment Activities Act (RPAA), which came into force on November 1, 2024, gives the Bank of Canada (BoC) authority to supervise Payment Service Providers (PSPs) operating in Canada. Before the RPAA, no federal regulator specifically oversaw payment intermediaries that were not banks — a gap that created consumer protection and systemic risk concerns as non-bank payment firms grew rapidly. The RPAA closes this gap by requiring PSPs to register with the BoC, maintain safeguarding arrangements for end-user funds, implement operational risk management frameworks, and notify the BoC of incidents and material changes. eFinMoney, as a firm that transfers funds on behalf of end users, qualifies as a PSP and is subject to the RPAA in addition to its existing FINTRAC obligations as an MSB."
    },
    {
      "title": "Who Must Register as a PSP?",
      "body": "The RPAA requires registration for entities that perform one or more 'retail payment activities' as defined in s.2 of the Act: (1) providing or maintaining an account that holds end-user funds; (2) holding end-user funds; (3) initiating a payment order at the request of an end user; (4) authorising a payment order or transmitting information used to authorise a payment order; (5) clearing or settling payment obligations. The activity must be performed as a business, in the ordinary course of business, and for an end user who is in Canada OR for a Canadian end user transacting cross-border. Registration is required before performing any of these activities. Entities that only process payments on their own behalf (e.g., a retailer processing its own sales) are excluded."
    },
    {
      "title": "The Registration Process — PSPConnect Portal",
      "body": "Registration is completed through PSPConnect, the Bank of Canada's online portal for PSPs (rps.bankofcanada.ca). The registration application requires: the PSP's legal name, business address, incorporation details, and contact information; a description of the payment activities performed; information about the PSP's safeguarding arrangements; an attestation about the ORM framework; and payment of the initial registration fee. The BoC reviews the application and may request additional information before granting or refusing registration. Once registered, the PSP appears on the public PSP Registry. eFinMoney's RPAA registration must be renewed and kept current; any material changes to the information filed must be notified to the BoC. The initial registration fee under the RPAA is $2,500."
    },
    {
      "title": "The Public PSP Registry",
      "body": "The Bank of Canada maintains a publicly accessible PSP Registry at bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/. The registry lists all entities registered under the RPAA, including their legal name, registration number, and the payment activities they are registered to perform. The registry serves multiple purposes: it allows end users and counterparties to verify that a payment provider is legitimately registered; it allows the BoC to demonstrate transparency in its supervisory activities; and it allows regulated financial institutions to conduct due diligence on PSP partners. Operating as a PSP without appearing on the registry — or presenting false information about registration status — is prohibited under the RPAA and may attract enforcement action."
    },
    {
      "title": "Annual Reporting to the Bank of Canada",
      "body": "Every registered PSP must submit an annual report to the Bank of Canada. The report is due by March 31 of each year and covers the preceding calendar year. Content required includes: confirmation that the PSP continued to perform the registered payment activities; updated information on safeguarding arrangements (including the total value of end-user funds held and the eligible accounts used); a description of any operational incidents; information about significant changes implemented during the year; and an attestation by a senior officer. The annual report is a key supervisory tool — the BoC uses it to monitor the overall health of the PSP sector and identify entities whose risk profile has changed. Failure to submit by March 31 is an immediate compliance deficiency."
    },
    {
      "title": "Significant Change and New Activity Notifications",
      "body": "Before implementing a significant change — or before commencing a new type of retail payment activity — a PSP must notify the Bank of Canada. Under RPAA s.26, a significant change includes: a change to the PSP's legal structure or control; a material change to the types of payment activities performed; a material change to safeguarding arrangements; or any other change the BoC designates as significant. The BoC has published step-by-step guides (May 2025) for both incident notification and significant change/new activity notification via PSPConnect. The key distinction from FINTRAC obligations: BoC notification must generally happen BEFORE the change, not after. Failing to pre-notify is a separate violation from the underlying change itself."
    },
    {
      "title": "The BoC Supervisory Framework",
      "body": "The Bank of Canada's supervisory framework for PSPs is described at bankofcanada.ca/core-functions/retail-payments-supervision/supervisory-framework-registration/. It includes: registration as the entry point; ongoing monitoring through annual reports and information requests; risk-based examinations (both desk-based and on-site); and enforcement tools for non-compliance. The BoC's supervisory approach is risk-proportionate — PSPs with larger volumes, more complex structures, or higher-risk profiles will receive more intensive supervision. Compliance orders, public disclosure of non-compliance, and monetary penalties are available enforcement tools. eFinMoney must cooperate fully with any BoC information request or examination, designate a primary contact for BoC communications, and maintain current contact information in PSPConnect."
    },
    {
      "title": "Consequences of Operating Without Registration",
      "body": "The RPAA makes it unlawful for a PSP to perform retail payment activities in Canada without being registered. A PSP that was already operating when the RPAA came into force had a transition period to register; that period has now closed. Operating without registration exposes the PSP to: a compliance order requiring it to register or cease operations; public disclosure of non-compliance (reputational damage); monetary penalties under the RPAA; and, in serious cases, referral to the Attorney General for prosecution. For eFinMoney, maintaining active RPAA registration alongside its FINTRAC MSB registration is a dual compliance obligation. Both registrations must be current and consistent with the entity's actual activities."
    }
  ]$sm_r01$::jsonb,
  quiz = $qz_r01$[
    {
      "question": "Which legislation requires Payment Service Providers to register with the Bank of Canada?",
      "options": ["The Bank Act", "The Retail Payment Activities Act (RPAA)", "The PCMLTFA", "The Financial Consumer Agency of Canada Act"],
      "answer": 1
    },
    {
      "question": "The RPAA came into force on:",
      "options": ["January 1, 2023", "June 1, 2024", "November 1, 2024", "March 31, 2025"],
      "answer": 2
    },
    {
      "question": "The PSP registration portal is called:",
      "options": ["FINTRAC F2R", "PSPConnect", "BoC PortalPlus", "OSFI Connect"],
      "answer": 1
    },
    {
      "question": "The initial registration fee under the RPAA is:",
      "options": ["$500", "$1,000", "$2,500", "$10,000"],
      "answer": 2
    },
    {
      "question": "The annual report to the Bank of Canada must be submitted by:",
      "options": ["December 31 of the reporting year", "January 31 of the following year", "March 31 of the following year", "June 30 of the following year"],
      "answer": 2
    },
    {
      "question": "Before implementing a significant change, a PSP must:",
      "options": ["Notify FINTRAC", "Notify the Bank of Canada in advance", "Notify the Financial Consumer Agency of Canada", "File an updated annual report"],
      "answer": 1
    },
    {
      "question": "The public PSP Registry is maintained by:",
      "options": ["FINTRAC", "OSFI", "The Bank of Canada", "The Financial Consumer Agency of Canada"],
      "answer": 2
    },
    {
      "question": "Which of the following is a 'retail payment activity' under the RPAA?",
      "options": ["A retailer processing its own sales payments", "Holding end-user funds as part of a payment service", "Providing investment advice", "Issuing mortgages"],
      "answer": 1
    },
    {
      "question": "Operating as a PSP without RPAA registration:",
      "options": ["Is permitted for up to 90 days while applying", "Is prohibited and subject to enforcement action", "Only requires a FINTRAC registration", "Is allowed for MSBs already registered with FINTRAC"],
      "answer": 1
    },
    {
      "question": "The PSP Registry serves which key purpose for end users?",
      "options": ["It lists exchange rates", "It allows verification that a payment provider is legitimately registered", "It processes payment transactions", "It provides FINTRAC report numbers"],
      "answer": 1
    },
    {
      "question": "A new type of retail payment activity must be notified to the BoC:",
      "options": ["Within 30 days after commencing", "Before commencing the activity", "Only at the next annual reporting date", "Only if the activity exceeds $10,000 per transaction"],
      "answer": 1
    },
    {
      "question": "The BoC's supervisory approach is described as:",
      "options": ["Uniform — all PSPs receive the same level of scrutiny", "Risk-proportionate — higher-risk PSPs receive more intensive supervision", "Volume-based — only PSPs with $1M+ in transactions are supervised", "Complaint-driven — supervision only follows customer complaints"],
      "answer": 1
    }
  ]$qz_r01$::jsonb
WHERE course_name = 'Bank of Canada Registration & Reporting';

-- ---------------------------------------------------------------
-- R-02  RPAA Compliance Gap Analysis
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'Compliance, Management',
  study_materials = $sm_r02$[
    {
      "title": "What Is an RPAA Compliance Gap Analysis?",
      "body": "A compliance gap analysis is a structured comparison of what an organisation currently does against what it is legally required to do. For the RPAA, it maps eFinMoney's existing policies, procedures, systems, and arrangements against the Bank of Canada's four core PSP obligations: (1) registration and ongoing reporting; (2) safeguarding of end-user funds; (3) operational risk management; and (4) incident notification. Each area is assessed as compliant, partially compliant, or non-compliant, and any gap is documented with its risk severity, the regulatory requirement it breaches, and a remediation action with a target date. A gap analysis is not a one-time exercise — it should be repeated annually (at minimum) and whenever the regulatory framework or eFinMoney's business model changes materially."
    },
    {
      "title": "The Four Core RPAA Obligations",
      "body": "Every PSP gap analysis must assess compliance against four pillars: (1) Registration and Reporting — Is the PSP registered? Is registration information current? Is the annual report submitted on time? Are significant changes and new activities pre-notified? (2) Safeguarding — Are end-user funds held in eligible accounts at a Canadian financial institution? Are they segregated from the PSP's own operating funds? Is a daily reconciliation performed? (3) Operational Risk Management — Does the PSP have a written ORM framework? Does it cover risk identification, assessment, mitigation, and monitoring? Is it approved by senior management? Is it tested? (4) Incident Response — Does the PSP have a written incident response plan? Can it notify the BoC within 24 hours (initial) and 72 hours (detailed) of a qualifying incident?"
    },
    {
      "title": "Assessing the Safeguarding Gap",
      "body": "To assess safeguarding compliance, auditors examine: (1) Where are end-user funds currently held? They must be in an eligible account — defined as a deposit account at a Canadian institution that is a member of CDIC or a provincial deposit insurer, or in certain government securities. (2) Are the funds segregated? The PSP's own operating funds must not be commingled with end-user funds in the same account. (3) Is a daily reconciliation performed and documented? The PSP must be able to show, for each day, that the balance in the safeguarding account matches the total of funds owed to end users. (4) Is there a written safeguarding policy that describes the arrangements? Gaps in any of these areas are typically high-severity because safeguarding directly protects consumer money."
    },
    {
      "title": "Assessing the ORM Gap",
      "body": "The operational risk management assessment examines whether the PSP has: (1) a documented ORM framework that identifies operational risks across technology, people, processes, and external events; (2) a risk assessment process that scores risks by likelihood and impact; (3) controls and mitigation strategies for each identified risk; (4) a business continuity plan (BCP) that specifies recovery time objectives for critical payment functions; (5) a testing schedule for ORM controls (penetration testing, BCP exercises, etc.); and (6) a reporting structure where ORM findings are escalated to senior management or the board. Gaps are commonly found in: missing BCP testing documentation, informal (undocumented) risk assessments, and ORM frameworks that list risks but have no mitigation controls."
    },
    {
      "title": "Assessing the Incident Response Gap",
      "body": "The incident response assessment examines whether the PSP: (1) has a written incident response policy that defines what constitutes a 'notifiable incident' under the RPAA; (2) has clear internal escalation procedures so that the compliance officer is notified quickly enough to meet the 24-hour BoC notification deadline; (3) has templates or scripts for the initial notification (24h) and detailed notification (72h) through PSPConnect; (4) has conducted at least one tabletop exercise simulating an incident to test the plan; and (5) maintains records of past incidents and notifications. The most common gap is the absence of a defined 'notifiable incident' classification — staff do not know which events trigger BoC notification, causing either over-reporting of minor events or, more dangerously, missing a notifiable incident entirely."
    },
    {
      "title": "Assessing Annual Reporting and Change Notifications",
      "body": "This pillar of the gap analysis examines: (1) Is there a defined process for collecting the information needed for the annual report before the March 31 deadline? (2) Who is responsible for completing and submitting the annual report in PSPConnect? (3) Is there a change management process that identifies significant changes early enough to pre-notify the BoC? (4) Has the PSP previously failed to pre-notify a significant change — and if so, has the gap been remediated? A common gap is the absence of a trigger in the change management process: a new product or partner relationship may be implemented without anyone recognising it as a 'significant change' requiring BoC pre-notification. Embedding RPAA change-notification questions into the project approval checklist closes this gap."
    },
    {
      "title": "Gap Scoring and Prioritisation",
      "body": "Not all gaps are equal. A gap analysis prioritises remediation based on two factors: severity (what is the regulatory and consumer protection impact of this gap?) and likelihood of detection (how likely is the BoC to identify this gap in an examination or annual report review?). High-severity, high-detection-likelihood gaps — such as missing safeguarding segregation or no incident notification plan — must be remediated immediately. Medium-severity gaps (e.g., ORM framework exists but has not been tested in two years) should be addressed within 90 days. Low-severity gaps (e.g., minor policy formatting issues) can be scheduled for the next routine policy update. Every gap, regardless of severity, should have a named owner and a target remediation date."
    },
    {
      "title": "Remediation Planning and Tracking",
      "body": "The output of the gap analysis is a remediation plan: a structured document listing each gap, its severity, the regulatory requirement it breaches, the action required to close it, the responsible owner, the target date, and the current status. The remediation plan should be reviewed monthly by the compliance officer and quarterly by senior management. When a gap is closed, the closure should be evidenced — a new policy version, a test result, a PSPConnect submission, or an updated safeguarding account statement. The gap analysis and remediation plan should be retained as compliance evidence. In a BoC examination, the examiner will ask: 'Have you conducted a gap analysis? What gaps did you find? What have you done to close them?' A documented, up-to-date remediation plan is the best answer."
    }
  ]$sm_r02$::jsonb,
  quiz = $qz_r02$[
    {
      "question": "A compliance gap analysis compares:",
      "options": ["Revenue against budget", "Current practices against regulatory requirements", "Staff performance against targets", "Transaction volumes against industry benchmarks"],
      "answer": 1
    },
    {
      "question": "How many core obligations does the RPAA place on PSPs?",
      "options": ["Two", "Three", "Four", "Six"],
      "answer": 2
    },
    {
      "question": "End-user funds must be held in an 'eligible account' — which of the following qualifies?",
      "options": ["A PSP's own operating account at any bank", "A deposit account at a CDIC-member Canadian institution, separate from the PSP's own funds", "Any account in a G7 country", "A virtual currency wallet designated for safeguarding"],
      "answer": 1
    },
    {
      "question": "The safeguarding daily reconciliation is used to verify that:",
      "options": ["Exchange rates are accurate", "The safeguarding account balance matches total end-user funds owed", "Staff have completed their training", "The annual report data is consistent with PSPConnect records"],
      "answer": 1
    },
    {
      "question": "Initial incident notification to the Bank of Canada must occur within:",
      "options": ["1 hour", "12 hours", "24 hours", "72 hours"],
      "answer": 2
    },
    {
      "question": "Detailed incident notification to the Bank of Canada must occur within:",
      "options": ["24 hours", "48 hours", "72 hours", "7 days"],
      "answer": 2
    },
    {
      "question": "What is a 'business continuity plan' (BCP) and why is it part of an ORM gap assessment?",
      "options": ["A marketing plan for business growth — reviewed as part of sales compliance", "A plan that specifies how critical payment operations will continue or recover after disruption — required by the ORM framework", "A plan for expanding to new payment corridors", "A financial projection required by OSFI"],
      "answer": 1
    },
    {
      "question": "The most common gap in incident response plans is:",
      "options": ["Absence of a PSPConnect account", "Staff not knowing which events qualify as 'notifiable incidents' under the RPAA", "Having no IT department", "Not subscribing to BoC newsletters"],
      "answer": 1
    },
    {
      "question": "A significant change requires BoC notification:",
      "options": ["Within 30 days after implementation", "Before implementation", "At the next annual report", "Only if the change affects safeguarding"],
      "answer": 1
    },
    {
      "question": "A high-severity gap in the gap analysis is best described as one that:",
      "options": ["Involves minor policy formatting issues", "Directly impacts consumer protection or is likely to be detected in a BoC examination", "Requires more than 90 days to fix", "Was identified by an external consultant"],
      "answer": 1
    },
    {
      "question": "The remediation plan output of a gap analysis should be reviewed by senior management at least:",
      "options": ["Daily", "Monthly", "Quarterly", "Annually only"],
      "answer": 2
    },
    {
      "question": "In a BoC examination, an auditor asks about your gap analysis. The best response is:",
      "options": ["Explain that a gap analysis is only required if FINTRAC requests one", "Produce a documented gap analysis and an up-to-date remediation plan with closure evidence", "Refer the examiner to your external legal counsel", "Provide only the annual report"],
      "answer": 1
    }
  ]$qz_r02$::jsonb
WHERE course_name = 'RPAA Compliance Gap Analysis';

-- ---------------------------------------------------------------
-- R-03  RPAA Policies & Procedures — ORM Framework
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'Compliance, Management',
  study_materials = $sm_r03$[
    {
      "title": "What Written Policies Does the RPAA Require?",
      "body": "The RPAA does not prescribe a specific list of policy documents, but the Bank of Canada's supervisory guidelines make clear that PSPs must have written policies and procedures covering: (1) safeguarding of end-user funds — how funds are held, reconciled, and protected; (2) operational risk management — how the PSP identifies, assesses, and mitigates operational risks; (3) incident response — how incidents are classified, escalated, investigated, and notified to the BoC; and (4) significant change and new activity management — how changes are identified and pre-notified. These policies must be approved by senior management or the board, must be accessible to relevant staff, and must be updated to reflect regulatory changes and lessons from incidents. Undocumented practices — 'we do it but have not written it down' — are treated as gaps in a BoC examination."
    },
    {
      "title": "Introduction to Operational Risk Management",
      "body": "Operational risk is the risk of loss resulting from inadequate or failed internal processes, people, systems, or external events. For a PSP like eFinMoney, operational risks include: technology outages preventing transactions; fraud or cyber-attacks on payment systems; human error causing misposted funds; reliance on third-party processors who experience disruptions; and natural disasters or regulatory actions affecting operations. The Bank of Canada's ORM guideline (published February 2024) provides a framework for PSPs to manage these risks proportionately. The guideline does not prescribe specific controls but sets principles: risks must be identified and assessed, controls must be implemented and tested, and the ORM framework must be subject to board-level oversight."
    },
    {
      "title": "BoC ORM Guideline — Key Components",
      "body": "The BoC's 'Operational Risk Management and Incident Response' guideline identifies five key components of a sound ORM framework for PSPs: (1) Governance — board and senior management are responsible for setting risk appetite and overseeing the ORM program. (2) Risk identification — a systematic process to identify all material operational risks. (3) Risk assessment — each identified risk is scored by likelihood and potential impact. (4) Risk mitigation — controls are implemented to reduce risks to an acceptable level. (5) Monitoring and reporting — ongoing tracking of risk indicators and escalation to management. The 'At a Glance' companion document summarises these five components in two pages and is a useful reference for staff introductions to ORM. The full guideline provides detailed expectations."
    },
    {
      "title": "Risk Identification for Payment Services",
      "body": "For eFinMoney specifically, a thorough risk identification exercise should cover: Technology risks — server outages, API failures with banking partners, database corruption, cybersecurity breaches. Process risks — incorrect fund routing, reconciliation failures, manual processing errors in high-volume periods. People risks — key-person dependency (only one person knows a critical system), fraud by internal staff, inadequate training. Third-party risks — failure of a banking partner, a currency exchange API, or a KYC verification provider. External risks — regulatory changes requiring system updates, natural disasters, currency controls imposed by a recipient country government. Each risk category should be documented in a risk register — a living document updated when new risks are identified or existing ones materially change."
    },
    {
      "title": "Risk Assessment — Scoring and Prioritisation",
      "body": "Once risks are identified, each is scored on two dimensions: likelihood (how probable is this risk materialising in the next 12 months?) and impact (if it materialises, how severe is the consequence for end users, operations, or compliance?). Common scoring scales use 1–5 for each dimension; the product (likelihood × impact) gives a raw risk score. High-score risks are prioritised for mitigation. The risk appetite — the level of risk the board is willing to accept — sets the threshold for when a risk requires a control. Risks that exceed the risk appetite without controls must be escalated to senior management for a decision: implement controls, transfer the risk (insurance), or formally accept it with documented rationale. Risk scores should be reassessed at least annually."
    },
    {
      "title": "Business Continuity and Disaster Recovery",
      "body": "A business continuity plan (BCP) describes how eFinMoney will maintain or rapidly restore critical payment operations after a disruptive event. Key elements: (1) Recovery Time Objective (RTO) — the maximum acceptable time for a critical function to be unavailable (e.g., 4 hours for the remittance platform). (2) Recovery Point Objective (RPO) — the maximum acceptable data loss (e.g., the last 15 minutes of transactions). (3) Alternate operating procedures — manual or backup processes if primary systems fail. (4) Communication plan — how clients, staff, banking partners, and the BoC are notified during an outage. (5) BCP testing — tabletop exercises and full drills, at minimum annually. Results must be documented. Untested BCPs are treated as non-existent in a BoC examination."
    },
    {
      "title": "Incident Classification and BoC Notification Triggers",
      "body": "Not every system problem or service disruption requires BoC notification. The RPAA requires notification for incidents that meet specific thresholds of impact on PSP operations, end-user funds, or payment system integrity. The BoC's incident notification guideline (February 2024) and the May 2025 step-by-step guide describe what qualifies. Key notification triggers include: an incident that materially impairs the PSP's ability to perform payment activities for more than a specified period; an incident that exposes end-user funds to risk of loss; a cybersecurity breach affecting payment data; and any incident the BoC designates as notifiable. Internal staff must know: (a) who decides whether an incident is notifiable; (b) who submits the notification in PSPConnect; and (c) the 24-hour initial / 72-hour detailed timeline."
    },
    {
      "title": "Incident Response Policy — Required Elements",
      "body": "The incident response policy must define: (1) What events constitute an 'incident' internally and, among those, which are 'notifiable' to the BoC. (2) The escalation chain — who is notified first, second, and third when an incident is detected. (3) The designated incident response team and their roles. (4) Procedures for containing the incident, preserving evidence, and beginning recovery. (5) The BoC notification workflow — who prepares the initial 24-hour notification, who approves it, and who submits it in PSPConnect. (6) Root cause analysis — after resolution, what process is used to identify the cause and prevent recurrence. (7) Post-incident review — a written report of the incident, the BoC notification timeline, and lessons learned. This document is a key exhibit in any BoC examination."
    },
    {
      "title": "Policy Review and Approval Cycle",
      "body": "Policies must be living documents — not written once and filed. The recommended cycle: (1) Initial approval by the board or senior management. (2) Annual review by the compliance officer to check for regulatory changes, lessons from incidents, and operational changes that affect the policy's accuracy. (3) Immediate update whenever a material change occurs — a new banking partner, a new payment corridor, a BoC guideline revision. (4) Version control — each version is dated, and the prior version is retained. (5) Staff notification — staff affected by a policy change are informed and, where required, re-trained. During a BoC examination, examiners ask for the current version of each policy, its approval date, and evidence of the last review. A policy approved in 2022 and never reviewed is a red flag."
    }
  ]$sm_r03$::jsonb,
  quiz = $qz_r03$[
    {
      "question": "Which of the following is NOT one of the five components of the BoC's ORM framework?",
      "options": ["Governance", "Risk identification", "Annual revenue projection", "Risk mitigation"],
      "answer": 2
    },
    {
      "question": "ORM stands for:",
      "options": ["Online Reporting Module", "Operational Risk Management", "Outbound Remittance Monitoring", "Oversight and Risk Measurement"],
      "answer": 1
    },
    {
      "question": "A Recovery Time Objective (RTO) defines:",
      "options": ["The cost of recovering from an incident", "The maximum acceptable time for a critical function to be unavailable", "The number of staff needed for recovery", "The frequency of BCP testing"],
      "answer": 1
    },
    {
      "question": "Initial incident notification to the Bank of Canada must occur within:",
      "options": ["1 hour", "12 hours", "24 hours", "72 hours"],
      "answer": 2
    },
    {
      "question": "Detailed incident notification to the Bank of Canada must occur within:",
      "options": ["24 hours", "48 hours", "72 hours", "7 business days"],
      "answer": 2
    },
    {
      "question": "An untested business continuity plan (BCP) is treated by the BoC as:",
      "options": ["Fully compliant — the plan's existence is what matters", "Non-existent for examination purposes — testing is required to demonstrate operability", "Acceptable if reviewed annually even without a drill", "Compliant if approved by the board"],
      "answer": 1
    },
    {
      "question": "The BoC ORM guideline requires that the ORM framework be subject to:",
      "options": ["External auditor approval only", "Board and senior management oversight", "OSFI approval", "FINTRAC review"],
      "answer": 1
    },
    {
      "question": "A 'risk appetite' in ORM terms is:",
      "options": ["The number of risks the PSP is willing to identify", "The level of risk the board is willing to accept without additional mitigation", "The maximum number of incidents per year", "The budget allocated for risk management"],
      "answer": 1
    },
    {
      "question": "Which of the following would trigger a BoC incident notification?",
      "options": ["A minor system slowdown lasting 5 minutes with no impact on end-user funds", "An outage that materially impairs the PSP's ability to perform payment activities", "A routine software update", "A staff member calling in sick"],
      "answer": 1
    },
    {
      "question": "How frequently must compliance policies be formally reviewed?",
      "options": ["Only when FINTRAC requires it", "At least annually, and immediately when material changes occur", "Every 5 years at the effectiveness review", "Only after a BoC examination"],
      "answer": 1
    },
    {
      "question": "Operational risks for eFinMoney include which of the following?",
      "options": ["Interest rate movements", "Currency exchange API failures and banking partner outages", "Stock market volatility", "Competitor pricing changes"],
      "answer": 1
    },
    {
      "question": "After an incident is resolved, the policy requires:",
      "options": ["Immediate deregistration from PSPConnect", "A root cause analysis and post-incident review report", "Filing an STR with FINTRAC", "Refunding all transactions processed during the incident"],
      "answer": 1
    }
  ]$qz_r03$::jsonb
WHERE course_name = 'RPAA Policies & Procedures';

-- ---------------------------------------------------------------
-- R-04  RPAA Role-Based Employee Training
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 45,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'All staff',
  study_materials = $sm_r04$[
    {
      "title": "Why Training Is a Core RPAA Obligation",
      "body": "The Bank of Canada expects PSPs to maintain a culture of compliance, and training is the foundation. Untrained staff cannot follow policies they have never seen, cannot recognise incidents that must be escalated, and cannot identify safeguarding breaches before they cause consumer harm. The RPAA does not specify a minimum number of training hours, but the BoC's supervisory framework makes clear that training must be: role-appropriate (not everyone needs the same depth of knowledge); current (reflecting the latest regulations and internal policies); documented (records showing who was trained, when, and on what); and recurring (not just at onboarding but annually, at minimum). During a BoC examination, examiners will ask to see training records and may test staff knowledge directly."
    },
    {
      "title": "Board and Senior Management Responsibilities",
      "body": "The board and senior management of a PSP are ultimately responsible for the compliance culture and the adequacy of the compliance program. Their RPAA-specific responsibilities include: approving the ORM framework and safeguarding policies; ensuring sufficient resources are allocated to compliance; receiving and acting on ORM and compliance reports; approving significant change decisions that require BoC pre-notification; and overseeing the annual reporting process. Senior management training should focus on the strategic obligations — not the operational procedures — and should cover: RPAA liability exposure, BoC supervisory expectations, the significance of the 24h/72h incident notification timelines, and the reputational implications of regulatory non-compliance."
    },
    {
      "title": "Compliance Officer Specific Training",
      "body": "The compliance officer bears the day-to-day responsibility for the RPAA program and requires the deepest knowledge. Their training needs include: the full text of the RPAA and its regulations; BoC published guidelines (safeguarding, ORM, incident notification, annual reporting, significant change); PSPConnect operation — specifically how to submit notifications and the annual report; the gap analysis methodology; BoC examination preparation; and regular updates when the BoC issues revised guidelines or FAQs. The compliance officer should also be aware of the dual-reporting obligation — as an MSB, eFinMoney's compliance officer must be equally familiar with FINTRAC requirements. Confusion between FINTRAC and BoC timelines (e.g., the 30-day STR window vs. the 24h incident notification) is a common error in examinations."
    },
    {
      "title": "Front-Line Staff — RPAA Awareness",
      "body": "Front-line staff (customer service, transaction processing, onboarding) do not need to know the full RPAA statute, but they must understand: (1) That eFinMoney is a registered PSP and what that means for how client funds are handled. (2) That end-user funds sent through eFinMoney are safeguarded — this is a trust obligation to clients, not just a regulatory one. (3) How to escalate unusual situations (systems failures, fund discrepancies, client complaints about missing funds) to the compliance officer or manager. (4) Not to make representations to clients about regulatory status that are inaccurate (e.g., claiming CDIC coverage for eFinMoney's own accounts). (5) Awareness of the basic incident classification — if a system goes down for more than a threshold time, staff must know who to call."
    },
    {
      "title": "Operations and Finance Staff Training",
      "body": "Operations and finance staff involved in managing safeguarding accounts and reconciliations require deeper training: (1) What an 'eligible account' is and why funds must be held there — not in a general operating account. (2) The daily reconciliation procedure — how to confirm that the safeguarding account balance matches the total of client funds outstanding. (3) What happens in a shortfall — the escalation procedure and the potential BoC notification obligation. (4) How to read and interpret the PSPConnect annual report data fields. (5) The interaction between the RPAA safeguarding obligation and the FINTRAC record-keeping obligation for transfer records. Operations staff who perform reconciliations without understanding why those controls exist are a compliance risk."
    },
    {
      "title": "Training Documentation and Records",
      "body": "Training records must show: who received training; on what date; what content was covered; how the training was delivered (in-person, online, self-study); and whether the learner passed an assessment. eFinMoney's Training page — which you are using now — creates a training record automatically when you pass the assessment. This record is retrievable by compliance for examination purposes. Paper-based training (e.g., policy walkthroughs in team meetings) must be documented separately — a sign-off sheet or attendance log retained in the compliance file. Training records must be retained for 5 years, consistent with PCMLTFR record-keeping requirements. During a BoC examination, training records may be requested to verify that staff in key roles were trained before handling those responsibilities."
    },
    {
      "title": "Keeping Training Current — Regulatory Updates",
      "body": "The RPAA is a relatively new statute and the BoC is actively developing its supervisory guidance. Since November 2024, the BoC has published: updated FAQs, the ORM At a Glance companion document (February 2025), the Incident Step-by-Step Guide (May 2025), the Significant Change Step-by-Step Guide (May 2025), and periodic supervisory updates. eFinMoney's compliance officer must monitor the BoC's PSP guidance page and the PSPConnect portal for new publications. When new or updated guidance is published, relevant staff must be briefed. Major updates — such as a new guideline or a regulatory amendment — warrant a formal training session with an updated assessment. Waiting for the annual training cycle to cover a major regulatory change is itself a compliance gap."
    }
  ]$sm_r04$::jsonb,
  quiz = $qz_r04$[
    {
      "question": "Training records under the RPAA must be retained for at least:",
      "options": ["1 year", "2 years", "5 years", "10 years"],
      "answer": 2
    },
    {
      "question": "Who bears ultimate responsibility for the RPAA compliance culture at eFinMoney?",
      "options": ["The front-line customer service team", "The IT department", "The board and senior management", "The external auditor"],
      "answer": 2
    },
    {
      "question": "Front-line staff need to know which of the following?",
      "options": ["The full text of the RPAA", "How to escalate systems failures or fund discrepancies to the compliance officer", "How to submit notifications in PSPConnect", "The annual report deadlines"],
      "answer": 1
    },
    {
      "question": "The compliance officer must be familiar with both FINTRAC and BoC requirements because:",
      "options": ["FINTRAC and BoC share a joint examination process", "eFinMoney holds both an MSB registration (FINTRAC) and a PSP registration (BoC), each with distinct obligations", "The BoC delegates its MSB supervision to FINTRAC", "FINTRAC approves BoC annual reports"],
      "answer": 1
    },
    {
      "question": "Operations staff involved in safeguarding reconciliations must understand:",
      "options": ["Only how to use the spreadsheet — not why the control exists", "What an eligible account is, how daily reconciliation works, and what to do in a shortfall", "Only the FINTRAC LCTR threshold", "Investment returns on the safeguarding account"],
      "answer": 1
    },
    {
      "question": "When the Bank of Canada publishes a major new guideline, eFinMoney should:",
      "options": ["Wait for the next annual training cycle to cover it", "Brief relevant staff promptly and update training materials — waiting for the annual cycle is itself a gap", "Only update the compliance officer's knowledge", "Submit a notification to the BoC that the guideline has been reviewed"],
      "answer": 1
    },
    {
      "question": "eFinMoney's Training page creates a training record when:",
      "options": ["The learner views the course landing page", "The learner passes the assessment", "The compliance officer manually logs the completion", "The annual report is submitted"],
      "answer": 1
    },
    {
      "question": "A common error found when compliance officers are tested on RPAA is:",
      "options": ["Confusing the annual report deadline with the LCTR threshold", "Confusing the 30-day STR window (FINTRAC) with the 24h incident notification timeline (BoC RPAA)", "Confusing the PSP Registry with the FINTRAC MSB registry", "Not knowing what PSPConnect is"],
      "answer": 1
    },
    {
      "question": "Role-based training means:",
      "options": ["All staff receive identical training regardless of their function", "Training is tailored to each role's actual responsibilities and knowledge needs", "Only the compliance officer receives RPAA training", "Training is based on the employee's salary grade"],
      "answer": 1
    },
    {
      "question": "Which of these would be an appropriate training record for a team meeting policy walkthrough?",
      "options": ["A verbal confirmation from the manager that it happened", "An attendance sign-off sheet retained in the compliance file with the date and content covered", "A calendar invitation", "A screenshot of the meeting invite"],
      "answer": 1
    }
  ]$qz_r04$::jsonb
WHERE course_name = 'RPAA Role-Based Employee Training';

-- ---------------------------------------------------------------
-- R-05  AML & Transaction Monitoring Controls
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'Compliance, Operations',
  study_materials = $sm_r05$[
    {
      "title": "The Dual Regulatory Framework — FINTRAC and BoC RPAA",
      "body": "eFinMoney operates under two distinct but complementary regulatory frameworks. FINTRAC regulates its AML/ATF obligations as an MSB under the PCMLTFA: reporting (STRs, LCTRs, EFTRs), client identification, record keeping, and the compliance program. The Bank of Canada regulates its payment activities as a PSP under the RPAA: safeguarding, ORM, incident notification, and annual reporting. These frameworks have different regulators, different thresholds, and different reporting timelines — but they share a common goal of preventing financial crime and protecting end users. Transaction monitoring is the practical tool that bridges both frameworks: a good monitoring system detects suspicious activity for FINTRAC reporting AND identifies operational risk events that may require BoC notification."
    },
    {
      "title": "Why Transaction Monitoring Matters",
      "body": "Transaction monitoring is the ongoing process of reviewing financial transactions to detect patterns or anomalies that indicate money laundering, terrorist financing, fraud, or policy violations. Without effective monitoring, an MSB/PSP processes transactions blindly — meeting threshold-triggered reporting requirements (LCTRs, EFTRs) but missing the suspicious patterns that require STRs. FINTRAC expects MSBs to have a monitoring program proportionate to their risk profile. The BoC expects PSPs to monitor for operational anomalies that could indicate system compromise or fund misappropriation. For eFinMoney, monitoring covers: LCTR/EFTR threshold aggregation; STR trigger identification; sanctions screening on each transaction; velocity checks; and unusual recipient/destination patterns."
    },
    {
      "title": "Rule-Based Transaction Monitoring",
      "body": "Rule-based monitoring applies predefined rules to every transaction and flags those that match. Examples of rules relevant to eFinMoney: (1) Any single transaction above $9,500 (approaching LCTR threshold) — flag for review. (2) Same sender conducting more than three transactions to the same recipient within 7 days above $1,000 each — flag for STR assessment. (3) Any transaction to a jurisdiction on the FATF grey or black list — flag for enhanced review. (4) Aggregate LCTR check — sum all cash transactions per client in a rolling 24-hour window and flag if total approaches or exceeds $10,000. (5) EFTR check — flag any international wire at or above $10,000. Rules should be documented, reviewed at least annually, and updated when new ML/TF typologies are identified by FINTRAC."
    },
    {
      "title": "Risk-Based Monitoring — Calibrating to Client and Product Risk",
      "body": "Risk-based monitoring applies more intensive scrutiny to higher-risk clients and transactions. Under the risk-based approach, eFinMoney should assign each client a risk tier based on client risk factors (PEP status, jurisdiction, occupation), transaction history, and product risk. High-risk clients receive enhanced monitoring: lower alert thresholds, mandatory manual review of flagged transactions, and more frequent account reviews. Lower-risk clients receive standard monitoring: automated rule checks, periodic sampling. The risk tier assigned to each client must be documented and must be updated if the client's behaviour changes. Monitoring that applies the same alert thresholds to a new remittance customer and a PEP from a high-risk jurisdiction is not risk-based — it is uniformly applied and therefore not compliant with the RBA."
    },
    {
      "title": "Sanctions Screening",
      "body": "Every transaction processed by eFinMoney must be screened against applicable sanctions lists before processing. Required lists include: OSFI's Consolidated List of Designated Persons (Canadian sanctions); OFAC's SDN List (US dollar-clearing obligations); UN Consolidated Sanctions List; and Global Affairs Canada's sanctions list. Screening must occur at the time of client onboarding AND at the time of each transaction — sanctions lists are updated frequently (sometimes daily) and a previously clean client can become designated between transactions. When a match is found, the transaction must be frozen, the funds must not be released, and a Terrorist Property Report must be filed with FINTRAC. Screening false positives (name matches that are not the designated person) must be documented and resolved before processing."
    },
    {
      "title": "Monitoring for Structuring",
      "body": "Structuring — deliberately breaking up transactions into amounts below reporting thresholds to avoid LCTR or EFTR filing — is a specific criminal offence under s.9(1) of the PCMLTFA. Monitoring systems must be calibrated to detect structuring: multiple transactions by the same sender just below $10,000 in a short period; transactions to the same recipient from different senders (smurfing); or unusual round-number patterns (e.g., exactly $9,999 repeated). Detecting structuring requires monitoring over time, not just transaction-by-transaction. A client who sends $9,500 on Monday, $9,500 on Wednesday, and $9,800 on Friday may not trigger any individual rule but should trigger a pattern alert. Structuring is itself a strong STR indicator regardless of whether the underlying funds are criminal."
    },
    {
      "title": "Alert Investigation and Escalation",
      "body": "A flagged transaction is not automatically suspicious — it must be investigated. The investigation process: (1) Compliance staff review the alert and gather context (client history, stated purpose, transaction pattern). (2) If the alert can be explained by legitimate activity, the investigator closes the alert with a documented rationale. (3) If the explanation is insufficient or the context deepens the concern, the alert is escalated to the compliance officer. (4) The compliance officer decides whether reasonable grounds to suspect exist. (5) If yes, an STR is filed within 30 days of forming those grounds. All alert investigations must be documented — the closure rationale for a closed alert is as important as the STR narrative for a filed one. FINTRAC may request alert documentation to assess whether the monitoring program is operating effectively."
    },
    {
      "title": "Technology and System Requirements for Monitoring",
      "body": "Effective transaction monitoring for an MSB/PSP at eFinMoney's scale requires: (1) A transaction database that captures all fields needed for monitoring (sender, recipient, amount, currency, date/time, channel). (2) Automated rule execution — manual review of every transaction is not scalable. (3) An alert management workflow — a queue where flagged transactions are assigned, investigated, documented, and resolved. (4) Sanctions screening integration — ideally at the point of transaction entry, not as a batch overnight process. (5) Reporting capability — the compliance officer needs to be able to pull statistics on alert volumes, closure rates, and STR conversion rates. These metrics are evidence that the monitoring program is functioning and calibrated appropriately. A monitoring system with a 100% closure rate and no STRs ever filed suggests the alert thresholds are too high."
    }
  ]$sm_r05$::jsonb,
  quiz = $qz_r05$[
    {
      "question": "Transaction monitoring bridges which two regulatory frameworks for eFinMoney?",
      "options": ["OSFI and FINTRAC", "FINTRAC (MSB AML) and BoC RPAA (PSP)", "CRA and FINTRAC", "Bank Act and RPAA"],
      "answer": 1
    },
    {
      "question": "Under a rule-based monitoring system, what would a 24-hour aggregation check do?",
      "options": ["Sum all transactions from all clients and flag if total exceeds $10,000", "Sum all cash transactions per individual client in a rolling 24-hour window and flag if approaching or exceeding $10,000", "Flag any transaction above $1,000", "Check transactions against the PSP Registry"],
      "answer": 1
    },
    {
      "question": "Structuring is defined as:",
      "options": ["Sending funds in a foreign currency", "Deliberately breaking up transactions into amounts below reporting thresholds to avoid LCTR or EFTR filing", "Using multiple banking partners", "Sending funds through a correspondent bank"],
      "answer": 1
    },
    {
      "question": "Structuring is a criminal offence under:",
      "options": ["RPAA s.26", "PCMLTFA s.9(1)", "Bank Act s.409", "PIPEDA s.7"],
      "answer": 1
    },
    {
      "question": "Sanctions screening must occur:",
      "options": ["Only at client onboarding", "Only for transactions above $10,000", "At client onboarding AND at the time of each transaction", "Only when a compliance officer requests it"],
      "answer": 2
    },
    {
      "question": "When a sanctions list match is found on a transaction, you must:",
      "options": ["Process the transaction and file an STR within 30 days", "Freeze the funds, not release them, and file a Terrorist Property Report with FINTRAC", "Reject the transaction and inform the client of the reason", "Contact the BoC within 24 hours"],
      "answer": 1
    },
    {
      "question": "A high-risk client receives enhanced monitoring, which includes:",
      "options": ["Higher alert thresholds and less frequent review", "Lower alert thresholds, mandatory manual review of flagged transactions, and more frequent account reviews", "No monitoring — high-risk clients are rejected", "Only LCTR monitoring"],
      "answer": 1
    },
    {
      "question": "A monitoring system with a 100% alert closure rate and no STRs ever filed most likely indicates:",
      "options": ["A very clean, low-risk client base", "Alert thresholds set too high — suspicious patterns are not being caught", "A fully compliant monitoring program", "No transactions were processed"],
      "answer": 1
    },
    {
      "question": "When an alert investigation concludes the activity is legitimate, the investigator should:",
      "options": ["Delete the alert from the system", "Close the alert with a documented rationale explaining why the activity was found to be legitimate", "File an STR anyway to be safe", "Report to the BoC within 24 hours"],
      "answer": 1
    },
    {
      "question": "Which of the following sanctions lists must eFinMoney screen against?",
      "options": ["OSFI Consolidated List only", "OFAC SDN List only", "OSFI Consolidated List, OFAC SDN List, UN Consolidated List, and Global Affairs Canada list", "No list — sanctions screening is only for banks"],
      "answer": 2
    },
    {
      "question": "The FINTRAC STR deadline after forming reasonable grounds is:",
      "options": ["24 hours", "5 business days", "30 calendar days", "60 calendar days"],
      "answer": 2
    },
    {
      "question": "A client sending exactly $9,999 on three separate occasions to the same recipient in one week should trigger:",
      "options": ["No alert — each transaction is below $10,000", "A pattern-based structuring alert — the repeated just-below-threshold amounts are an ML indicator", "An LCTR filing for the aggregated amount", "Only an EFTR if the recipient is international"],
      "answer": 1
    }
  ]$qz_r05$::jsonb
WHERE course_name = 'AML & Transaction Monitoring Controls';

-- ---------------------------------------------------------------
-- R-06  Vendor Management & Data Security
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'Compliance, Technology, Operations',
  study_materials = $sm_r06$[
    {
      "title": "Why Vendor Management Matters Under the RPAA",
      "body": "Most PSPs rely on third-party service providers for critical functions: cloud infrastructure, banking API connectivity, KYC/identity verification, sanctions screening, and payment processing. The Bank of Canada's ORM guideline treats third-party risk as a core component of operational risk — a PSP cannot outsource accountability for its RPAA obligations by pointing to a vendor failure. If a critical vendor goes down and eFinMoney cannot process payments, the impact on end users and the BoC notification obligation exist regardless of whether the failure originated inside eFinMoney or in a third-party system. Effective vendor management ensures that material vendors are assessed before engagement, contracted appropriately, monitored continuously, and replaceable if they fail."
    },
    {
      "title": "Classifying Vendors by Criticality",
      "body": "Not all vendors carry the same RPAA risk. eFinMoney should classify vendors by criticality: (1) Critical — vendors whose failure would prevent eFinMoney from performing its registered payment activities (e.g., banking API provider, transaction processing platform, cloud hosting). For these, enhanced due diligence, contractual protections, and contingency plans are required. (2) Important — vendors whose failure would materially degrade operations but not completely stop them (e.g., a secondary FX rate provider). Standard due diligence and annual review. (3) Non-critical — vendors with no payment-function role (e.g., office supplies, HR software). Minimal due diligence. The classification must be documented and reviewed annually or when a vendor's role changes."
    },
    {
      "title": "Due Diligence Before Engaging a Vendor",
      "body": "Before engaging a critical or important vendor, eFinMoney should conduct: (1) Financial health check — is the vendor financially stable? A vendor approaching insolvency is an operational risk. (2) Security assessment — does the vendor have adequate cybersecurity controls? Do they hold relevant certifications (ISO 27001, SOC 2)? (3) Regulatory standing — is the vendor itself regulated, and does it have a clean regulatory history? (4) Operational resilience — does the vendor have its own BCP? What are their published SLAs for uptime and incident recovery? (5) Reference checks — what do other PSPs or financial institutions say about the vendor's reliability? The due diligence findings must be documented and retained. A vendor engaged without documented due diligence is an ORM gap."
    },
    {
      "title": "Contract Requirements for Critical Vendors",
      "body": "Contracts with critical vendors must include: (1) Data security and confidentiality obligations — the vendor cannot share eFinMoney's client data without authorisation. (2) Service level agreements (SLAs) with defined uptime guarantees and incident response timelines. (3) Audit rights — eFinMoney's right to audit the vendor's controls or receive third-party audit reports (e.g., SOC 2 Type II). (4) Notification obligations — the vendor must notify eFinMoney promptly of any security incident, system outage, or regulatory action affecting their services. (5) Business continuity provisions — what happens if the vendor cannot provide services for an extended period? (6) Termination rights — eFinMoney must be able to exit the relationship without undue lock-in if the vendor fails to perform. These provisions protect eFinMoney from vendor failures cascading into RPAA incidents."
    },
    {
      "title": "Ongoing Vendor Monitoring",
      "body": "Vendor due diligence is not a one-time exercise. Ongoing monitoring of critical vendors includes: (1) Annual review of the vendor's financial health and regulatory standing. (2) Reviewing SOC 2 Type II or equivalent reports when published. (3) Tracking SLA performance — is the vendor meeting its uptime and response commitments? (4) Reviewing any security incident notifications from the vendor and assessing whether they constitute an RPAA-notifiable incident for eFinMoney. (5) Periodic reviews of the vendor's sub-contractors (fourth-party risk) for critical services. A vendor that was stable and well-governed when first engaged can deteriorate — a PSP that fails to monitor this may discover the problem only when the vendor fails during a high-volume period."
    },
    {
      "title": "Data Security and PIPEDA",
      "body": "eFinMoney processes personal information (client names, addresses, dates of birth, ID documents) in connection with every payment transaction. This processing is subject to the Personal Information Protection and Electronic Documents Act (PIPEDA) in addition to RPAA and PCMLTFA obligations. Key PIPEDA requirements: (1) Personal information may only be collected for identified purposes and may not be used for other purposes without fresh consent. (2) It must be protected by security safeguards appropriate to its sensitivity — payment and ID data is highly sensitive. (3) Individuals have a right to access and correct their personal information. (4) Data breaches that pose real risk of significant harm must be reported to the Office of the Privacy Commissioner and the affected individuals. PCMLTFA record-keeping obligations and PIPEDA access rights sometimes create tension — legal advice should be sought when a client requests deletion of transaction records that must be retained."
    },
    {
      "title": "Cloud Services and Data Residency",
      "body": "eFinMoney likely uses cloud infrastructure for its transaction platform. Key considerations: (1) Where is the data physically stored? The PCMLTFR and RPAA do not currently mandate Canadian data residency, but PIPEDA requires security safeguards appropriate to the sensitivity of the data — storing client payment data with a cloud provider that has poor security practices is a PIPEDA risk. (2) Are FINTRAC-required records accessible? Records must be retrievable for FINTRAC examination regardless of where they are stored. (3) Does the cloud provider notify eFinMoney of outages promptly enough to meet the 24-hour BoC incident notification deadline? (4) Is there a contractual right to export or port data if the cloud provider is changed? Cloud lock-in that prevents switching providers is an ORM risk."
    },
    {
      "title": "Contingency Planning for Vendor Failures",
      "body": "The BCP must address each critical vendor: what does eFinMoney do if Vendor X is unavailable for 24, 48, or 72 hours? Options include: (1) Manual processing — are there documented manual procedures for processing transactions if the automated platform is down? (2) Alternative vendors — is there a pre-approved secondary vendor that can be activated quickly? (3) Transaction queuing — can transactions be queued safely until the primary system recovers? (4) Client communication — how are clients notified of delays, and who is authorised to issue these communications? (5) BoC notification trigger — if the outage impairs payment activities beyond a defined threshold, who initiates the RPAA incident notification process? Contingency plans must be tested — a plan that has never been rehearsed is a compliance gap."
    }
  ]$sm_r06$::jsonb,
  quiz = $qz_r06$[
    {
      "question": "Under the BoC's ORM guideline, a PSP that experiences a critical vendor failure:",
      "options": ["Is exempt from RPAA obligations because the failure was external", "Retains full accountability for its RPAA obligations regardless of the cause of the failure", "Must immediately deregister from PSPConnect", "Is only liable if the vendor is also registered under the RPAA"],
      "answer": 1
    },
    {
      "question": "A 'critical' vendor for eFinMoney is one whose failure would:",
      "options": ["Increase operating costs", "Prevent eFinMoney from performing its registered payment activities", "Cause a minor service delay", "Require a new contract negotiation"],
      "answer": 1
    },
    {
      "question": "Before engaging a critical vendor, eFinMoney should conduct:",
      "options": ["No due diligence — vendor contracts cover all risks", "A documented assessment of financial health, security controls, regulatory standing, and operational resilience", "Only a price comparison", "A reference check with one client only"],
      "answer": 1
    },
    {
      "question": "SOC 2 Type II is relevant to vendor management because:",
      "options": ["It is a sales certification", "It provides third-party assurance over a vendor's security and operational controls over a period of time", "It is required by FINTRAC", "It replaces the need for a contract with the vendor"],
      "answer": 1
    },
    {
      "question": "Under PIPEDA, a data breach that poses real risk of significant harm must be reported to:",
      "options": ["FINTRAC only", "The Bank of Canada only", "The Office of the Privacy Commissioner and the affected individuals", "OSFI and the RCMP"],
      "answer": 2
    },
    {
      "question": "The contract with a critical vendor must include audit rights because:",
      "options": ["It is required by the Bank Act", "eFinMoney must be able to verify the vendor's controls or receive equivalent assurance", "Vendors must disclose their pricing annually", "It is required by FINTRAC for all service contracts"],
      "answer": 1
    },
    {
      "question": "Ongoing monitoring of a critical vendor should include:",
      "options": ["A one-time annual check of their website", "Annual review of financial health, SLA performance tracking, and review of security incidents and audit reports", "Only contacting the vendor if eFinMoney experiences a problem", "No monitoring — the contract already obligates the vendor to perform"],
      "answer": 1
    },
    {
      "question": "PIPEDA and PCMLTFA record retention obligations can create tension because:",
      "options": ["PIPEDA requires 10-year retention while PCMLTFA requires 5", "A client requesting deletion of personal data under PIPEDA may conflict with the mandatory 5-year PCMLTFA retention period", "PIPEDA does not apply to financial institutions", "PCMLTFA overrides PIPEDA in all cases"],
      "answer": 1
    },
    {
      "question": "Cloud data residency is a risk consideration because:",
      "options": ["Cloud providers are never regulated", "The physical location of data can affect security obligations and FINTRAC record accessibility", "Cloud storage is prohibited under the RPAA", "Only domestic cloud providers are permitted"],
      "answer": 1
    },
    {
      "question": "A contingency plan for a vendor failure that has never been tested is treated as:",
      "options": ["Fully compliant — the plan's existence is sufficient", "A compliance gap — untested plans cannot be relied upon", "Acceptable for non-critical vendors only", "Compliant if the vendor has a good SLA"],
      "answer": 1
    },
    {
      "question": "Vendor notification obligations in a contract require the vendor to:",
      "options": ["Notify eFinMoney only when the outage exceeds 24 hours", "Notify eFinMoney promptly of any security incident, system outage, or regulatory action affecting their services", "Notify the BoC directly on eFinMoney's behalf", "File an annual security report with PSPConnect"],
      "answer": 1
    },
    {
      "question": "Fourth-party risk refers to:",
      "options": ["The risk posed by eFinMoney's fourth-largest client", "The risk from a critical vendor's own sub-contractors whose failure could cascade to eFinMoney", "The fourth element of the ORM framework", "Risks outside eFinMoney's control entirely"],
      "answer": 1
    }
  ]$qz_r06$::jsonb
WHERE course_name = 'Vendor Management & Data Security';

-- ---------------------------------------------------------------
-- R-07  Financial Crime & Safeguarding Audits
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  role_requirement  = 'Compliance, Finance, Management',
  study_materials = $sm_r07$[
    {
      "title": "Safeguarding of End-User Funds — The Core RPAA Obligation",
      "body": "The safeguarding obligation under the RPAA is the most direct consumer protection requirement: when eFinMoney holds end-user funds in the course of a payment transaction, those funds must be protected against loss if eFinMoney becomes insolvent or otherwise unable to meet its obligations. The Bank of Canada's Safeguarding Guideline (February 2024) specifies how PSPs must comply. The three pillars of safeguarding are: (1) Hold funds in an eligible account — a deposit account at a CDIC-member institution or provincial equivalent, or in eligible securities. (2) Segregate end-user funds from eFinMoney's own operating funds — no commingling. (3) Maintain records that allow immediate identification of each end user's funds. The 'At a Glance' companion document (February 2025) summarises these obligations in accessible language for staff."
    },
    {
      "title": "What Are 'End-User Funds'?",
      "body": "End-user funds are funds that a PSP holds in connection with performing a retail payment activity — specifically, funds received from or on behalf of an end user for the purpose of a payment. They do not include: funds held by the PSP on its own account (operating capital, revenues); funds held under a trust arrangement governed by a separate legal framework; or funds that have been successfully delivered to the recipient and are no longer in the PSP's custody. In a typical eFinMoney transaction: a client sends $500 to Nigeria. From the moment eFinMoney receives the $500 until it is delivered to the recipient (and confirmed), those $500 are end-user funds subject to the safeguarding obligation. The total value of end-user funds outstanding at any point in time determines the required safeguarding balance."
    },
    {
      "title": "Eligible Accounts and the Commingling Prohibition",
      "body": "End-user funds must be held in an eligible account — defined in the RPAA as a deposit account at a Canadian institution that is a member of the Canada Deposit Insurance Corporation (CDIC) or a provincial deposit insurer. Government securities (Government of Canada treasury bills, provincial bonds) are also eligible. eFinMoney's operating accounts (for paying salaries, rent, and other expenses) are NOT eligible safeguarding accounts. Commingling — depositing end-user funds into an operating account, even temporarily — is prohibited. The commingling prohibition applies from the moment funds are received: eFinMoney cannot route end-user funds through its operating account as a clearing step before transferring to the safeguarding account. A dedicated safeguarding account must receive funds directly."
    },
    {
      "title": "Daily Reconciliation — The Core Control",
      "body": "The most important internal control for safeguarding compliance is the daily reconciliation. Each business day, the balance in the safeguarding account must equal the total value of end-user funds outstanding — funds received for which the corresponding payment to the recipient has not yet been completed and confirmed. The reconciliation process: (1) Calculate total end-user funds outstanding from the transaction system. (2) Retrieve the safeguarding account balance as of the same date. (3) Compare the two figures. (4) Investigate and resolve any discrepancy immediately. (5) Document the reconciliation result and any discrepancies with their resolution. A shortfall — where the safeguarding account holds less than the total outstanding obligations — is a serious compliance breach and may itself trigger an RPAA incident notification to the Bank of Canada."
    },
    {
      "title": "The BoC Safeguarding Guideline — Key Requirements",
      "body": "The Safeguarding of End-User Funds Guideline (February 2024) requires PSPs to: (1) Establish and maintain a written safeguarding policy describing the arrangements. (2) Designate one or more eligible accounts for safeguarding. (3) Ensure the safeguarding account holds at least the total end-user funds outstanding at all times. (4) Perform and document daily reconciliations. (5) Not withdraw funds from the safeguarding account for operational purposes — only to complete payments to recipients or to return funds to end users. (6) Report on safeguarding arrangements in the annual report (due March 31), including the average value of end-user funds held and the names of the eligible institutions. Failure to maintain adequate safeguarding is among the most serious RPAA violations because it directly endangers consumer money."
    },
    {
      "title": "Financial Crime Audit Methodology",
      "body": "A financial crime audit examines whether an MSB/PSP's AML/ATF controls are operating effectively. The audit methodology typically involves: (1) Policy and procedure review — are the policies current and aligned with FINTRAC and BoC requirements? (2) Transaction sampling — selecting a random and risk-based sample of transactions and verifying that the correct controls were applied (client ID verified, LCTR/EFTR filed where required, STR analysis conducted). (3) Alert review — selecting a sample of monitoring alerts and verifying they were investigated and resolved appropriately. (4) STR quality review — reviewing submitted STRs for completeness and timeliness. (5) Staff interviews — testing whether front-line staff understand their obligations. The audit produces a findings report with deficiencies rated by severity and recommended remediation actions."
    },
    {
      "title": "Internal Audit vs. External Audit for PSPs",
      "body": "PSPs can use internal audit functions or engage external audit firms for financial crime and safeguarding audits. Internal audit provides: faster turnaround, lower cost, deeper institutional knowledge, and the ability to conduct ongoing monitoring. Its limitation is independence — an internal auditor reports within the same organisation they audit. External audit provides: independence, benchmark knowledge from auditing multiple PSPs, and credibility for Board and regulator audiences. For the FINTRAC compliance effectiveness review (every 2 years), the reviewer must be sufficiently independent — this usually means an external firm or an internal audit function with a direct reporting line to the board. For routine safeguarding reconciliation reviews, internal audit is appropriate. The choice between internal and external should be documented and rationale retained."
    },
    {
      "title": "Documenting and Reporting Audit Findings",
      "body": "Audit findings must be documented in a written report that includes: the scope and methodology of the audit; the sample size and selection rationale; findings categorised by severity (critical, major, minor); for each finding, the specific control or policy that was deficient and the regulatory requirement it breaches; recommended remediation actions with suggested timelines; and management responses (has the finding been acknowledged? Is there a remediation plan?). The audit report must be presented to senior management and, for serious findings, to the board. Remediation actions must be tracked to completion. A finding from a prior audit that has not been closed is a repeated finding — the most serious category in a regulatory examination because it demonstrates that the PSP knew about the problem and failed to fix it."
    },
    {
      "title": "Connecting the Audit to the Annual Report and BoC Examination",
      "body": "The annual report submitted to the BoC by March 31 includes an attestation by a senior officer that the PSP has complied with its RPAA obligations. A comprehensive internal safeguarding and financial crime audit, conducted before March 31, provides the evidence base for that attestation. If the audit reveals a material deficiency — for example, that the safeguarding account was underfunded for a period during the year — the PSP must consider whether that deficiency must be disclosed in the annual report or whether it constitutes a notifiable incident. The BoC uses annual reports and examination findings to identify PSPs for enhanced supervisory attention. A PSP that consistently produces clean audit findings, timely annual reports, and responsive remediation of any gaps builds a strong regulatory relationship."
    }
  ]$sm_r07$::jsonb,
  quiz = $qz_r07$[
    {
      "question": "What is the primary purpose of the RPAA safeguarding obligation?",
      "options": ["To maximise the interest earned on client funds", "To protect end-user funds against loss if the PSP becomes insolvent or unable to meet obligations", "To ensure the PSP has enough capital for operations", "To comply with CDIC insurance requirements"],
      "answer": 1
    },
    {
      "question": "An 'eligible account' for safeguarding purposes is:",
      "options": ["Any bank account in the PSP's name", "A deposit account at a CDIC-member Canadian institution or an account holding eligible government securities", "The PSP's main operating account", "Any account outside Canada for international transactions"],
      "answer": 1
    },
    {
      "question": "The commingling prohibition means:",
      "options": ["PSPs cannot mix Canadian and foreign currencies", "End-user funds must not be deposited into the PSP's own operating account", "Safeguarding accounts cannot hold multiple clients' funds together", "Staff cannot access safeguarding account statements"],
      "answer": 1
    },
    {
      "question": "The daily safeguarding reconciliation compares:",
      "options": ["Revenue against expenses", "The safeguarding account balance against the total value of end-user funds outstanding", "LCTR filings against transaction logs", "Annual report data against PSPConnect records"],
      "answer": 1
    },
    {
      "question": "A shortfall in the safeguarding account (account holds less than total outstanding obligations) is:",
      "options": ["Normal — differences are settled in the annual report", "A serious compliance breach that may trigger an RPAA incident notification to the BoC", "Acceptable if the shortfall is less than 5%", "Only relevant if a client requests a refund"],
      "answer": 1
    },
    {
      "question": "End-user funds are subject to the safeguarding obligation from the moment:",
      "options": ["The annual report is submitted", "eFinMoney receives them until the payment to the recipient is completed and confirmed", "The client signs the terms of service", "The funds arrive in the recipient country"],
      "answer": 1
    },
    {
      "question": "The BoC Safeguarding Guideline was published in:",
      "options": ["January 2022", "November 2024 when RPAA came into force", "February 2024", "March 2025"],
      "answer": 2
    },
    {
      "question": "A financial crime audit methodology includes:",
      "options": ["Testing marketing materials for accuracy", "Transaction sampling, alert review, STR quality review, policy review, and staff interviews", "Only reviewing the compliance officer's credentials", "Submitting a draft audit report to FINTRAC for approval"],
      "answer": 1
    },
    {
      "question": "For the FINTRAC compliance effectiveness review (required every two years), the reviewer must be:",
      "options": ["A FINTRAC-certified auditor", "Sufficiently independent — typically an external firm or internal audit reporting directly to the board", "A member of the compliance team", "Approved by the Bank of Canada"],
      "answer": 1
    },
    {
      "question": "A 'repeated finding' in an audit is the most serious category because:",
      "options": ["It involves a large dollar amount", "It demonstrates that the PSP knew about the deficiency and failed to remediate it", "It requires immediate FINTRAC reporting", "It triggers automatic deregistration"],
      "answer": 1
    },
    {
      "question": "The annual report to the BoC (due March 31) includes:",
      "options": ["Only the PSP's financial statements", "An attestation by a senior officer that the PSP has complied with RPAA obligations, including safeguarding details", "The full audit report", "The PSP's marketing plan"],
      "answer": 1
    },
    {
      "question": "The safeguarding account balance in the annual report should reflect:",
      "options": ["The highest single-day balance during the year", "The average value of end-user funds held over the reporting year", "The balance on December 31 only", "Only completed (not pending) transactions"],
      "answer": 1
    },
    {
      "question": "A PSP may withdraw funds from the safeguarding account for:",
      "options": ["Paying operating expenses when cash is tight", "Completing payments to recipients or returning funds to end users — not for operational purposes", "Any purpose, as long as the account is replenished within 30 days", "Investment in government securities only"],
      "answer": 1
    }
  ]$qz_r07$::jsonb
WHERE course_name = 'Financial Crime & Safeguarding Audits';
