-- ==============================================================
-- Phase 5: FINTRAC elective programme — 5 new courses (all INSERT)
-- is_mandatory=false, frequency_months=24, pass_mark=70, program_area='fintrac_elective'
--
-- F-E1  Sanctions Compliance & Terrorist Property Reporting — 7L 10Q
-- F-E2  Privacy, PIPEDA & Data Stewardship                  — 7L 10Q
-- F-E3  Fraud Awareness & Internal Controls                 — 7L 10Q
-- F-E4  Advanced ML/TF Typologies for Remittances           — 7L 10Q
-- F-E5  Compliance Culture & Ethics                         — 7L 10Q
-- ==============================================================

-- ---------------------------------------------------------------
-- F-E1  Sanctions Compliance & Terrorist Property Reporting
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Sanctions Compliance & Terrorist Property Reporting',
  'compliance', 'fintrac_elective', false, 24, 40, 70,
  'All staff',
  'Practical sanctions screening obligations: legal framework, screening at every step, hit resolution, freezing funds, and filing Terrorist Property Reports through F2R.',
  $sm_fe1$[
    {
      "title": "Why Sanctions Compliance Is Non-Negotiable",
      "body": "Sanctions compliance is not part of the PCMLTFA AML program — it is a separate and parallel legal obligation. Canadian MSBs and PSPs must comply with: the Special Economic Measures Act (SEMA), which implements Canada's unilateral foreign-policy sanctions (currently applied to Russia, Iran, Belarus, Myanmar, and others); the Justice for Victims of Corrupt Foreign Officials Act (JVCFOA), which targets corrupt officials and human rights abusers; the United Nations Act (UNA), which implements binding UN Security Council resolutions (including al-Qaeda and ISIL asset freezes); and the Criminal Code, which criminalises holding or dealing in terrorist property. FINTRAC administers the PCMLTFA obligation to file Terrorist Property Reports when designated persons' assets are identified. OSFI maintains the Consolidated List of Designated Persons — the primary domestic reference. Non-compliance with any of these regimes is a criminal offence, not merely an administrative violation."
    },
    {
      "title": "The Screening Obligation — When and What to Screen",
      "body": "A common gap is screening only at client onboarding and never again. In practice, the screening obligation is continuous: (1) Onboarding screen — every new client and all identified beneficial owners must be screened against the OSFI Consolidated List, OFAC SDN List, UN Consolidated List, and Global Affairs Canada sanctions list before any funds are moved. (2) Transaction-level screen — at every transaction, both the sender and the named recipient (beneficiary) must be screened. A beneficiary in Lagos or Lusaka who has never had an eFinMoney account must still be screened before funds are sent. (3) Periodic full-file re-screen — the entire active client base should be re-screened at least monthly against updated lists, because designations happen without notice and a client who was clean at onboarding may be designated next week."
    },
    {
      "title": "Reading a Sanctions Alert — Is It a Match?",
      "body": "Because designated persons share names with many ordinary people, most sanctions alerts are false positives. The disambiguation process: (1) Retrieve the full alert details — which list, which entry, and which identifiers are populated (date of birth, nationality, passport number, address). (2) Compare identifiers to the client record. If the alert entry shows DOB 1965-03-12 and the client is DOB 1988-11-04 — a clear mismatch — document the comparison and clear the alert. (3) If the alert entry has no specific identifiers (name only) and the name is common — document the analysis: explain why the client is not the designated person (e.g., different nationality, known transaction history consistent with legitimate purposes). (4) If identifiers are consistent and cannot be ruled out — treat it as a potential true hit and escalate immediately. Never clear a hit on 'gut feeling' — every clearance must have a documented rationale."
    },
    {
      "title": "When You Have a True Hit — The Immediate Response",
      "body": "Confirming a sanctions match triggers a mandatory sequence of actions. They must happen in this order, and fast: (1) Freeze — do not process any transaction involving the funds. Do not release, transfer, convert, or allow the client to withdraw the funds. The freeze is absolute. (2) Do not tip off — do not tell the client that they have been identified as a designated person or that a report is being filed. Telling the client is itself a criminal offence under the PCMLTFA. (3) Notify internally — escalate to the compliance officer and senior management immediately. (4) Notify OSFI — email OSFI's Financial Intelligence and Protection unit confirming that property belonging to a designated person is being held. (5) File the Terrorist Property Report — through the F2R portal (the same system used for STRs and LCTRs). The TPR must be filed as soon as practicable — there is no specific number of days, but delays without justification are a separate violation."
    },
    {
      "title": "Filing the Terrorist Property Report in F2R",
      "body": "The Terrorist Property Report is filed through the FINTRAC F2R reporting portal — the same system used for STRs, LCTRs, and EFTRs. Required fields in the TPR: (1) The basis for the report — which regime (SEMA, JVCFOA, UNA, Criminal Code) and which designated person or entity. (2) A description of the property being held — the amount, currency, account or reference number, and the date the funds were received. (3) The circumstances — how the property came to be held by eFinMoney (client initiated a remittance, funds arrived from an inbound transfer, etc.). (4) Any additional context — whether the client has made attempts to withdraw, any communications from the client about the funds. Unlike STRs (which can be filed in batches), a TPR is tied to specific property held now — file it immediately rather than accumulating details. Retain the F2R submission confirmation and the internal documentation of the freeze."
    },
    {
      "title": "The Tipping-Off Prohibition in Sanctions Context",
      "body": "The tipping-off prohibition under the PCMLTFA applies equally to TPRs as to STRs: eFinMoney and its staff must not disclose to the designated person or any associate that property has been identified and frozen, or that a TPR has been filed. In a sanctions context, this creates a specific operational challenge: the client may call asking why their transaction hasn't processed, why their account is frozen, or what has happened to their money. Staff must not confirm that a sanctions hit occurred. An appropriate response is to tell the client that the transaction is under review and that they will be contacted in due course by the compliance team. Do not apologise, do not explain, do not provide timelines that hint at an investigation. The compliance officer will advise on any further client communications after legal counsel has been consulted."
    },
    {
      "title": "Program Hygiene — Keeping Sanctions Compliance Operational",
      "body": "A sanctions program that is technically designed but not maintained in operation is not compliant. Regular hygiene tasks: (1) Verify list currency — confirm that the screening system is receiving list updates at the expected frequency. OFAC updates its SDN list multiple times per day; OSFI can update at any time. A system that relies on weekly manual downloads is exposing the business to a week-long window of unscreened designations. (2) Test the screening system — periodically submit a known test designation (a dummy entry added to a sandbox list) and confirm it generates an alert. (3) Review hit resolution records — every quarter, a supervisor should review a sample of cleared hits and confirm the clearance rationale is documented and defensible. (4) Annual training — all client-facing and operations staff must receive annual sanctions training. A staff member who processes a transaction for a designated person without recognising the match is as much of a failure as a broken screening system."
    }
  ]$sm_fe1$::jsonb,
  $qz_fe1$[
    {
      "question": "A Terrorist Property Report must be filed when eFinMoney:",
      "options": ["Receives a transaction over $10,000 from any foreign country", "Holds or controls property belonging to a person or entity designated under SEMA, JVCFOA, the UN Act, or the Criminal Code", "Suspects a client of structuring", "Files an STR on a client for the second time"],
      "answer": 1
    },
    {
      "question": "Sanctions screening must occur at:",
      "options": ["Onboarding only — subsequent transactions for known clients are exempt", "Onboarding, every transaction (sender and beneficiary), and periodic full-file re-screening", "Only for transactions above $10,000", "Only when a FINTRAC examination is scheduled"],
      "answer": 1
    },
    {
      "question": "When clearing a sanctions alert as a false positive, staff must:",
      "options": ["Mark it cleared in the system with no further documentation", "Document the specific identifiers compared and the rationale for determining the client is not the designated person", "Get approval from OSFI before clearing", "File a Suspicious Transaction Report anyway"],
      "answer": 1
    },
    {
      "question": "The first action when a sanctions hit is confirmed as a true match is:",
      "options": ["Contact the client to verify their identity", "Freeze the funds — do not process any transaction involving them", "File the TPR and wait 30 days before freezing", "Transfer the funds to a government escrow account"],
      "answer": 1
    },
    {
      "question": "Telling the client that their funds have been frozen due to a sanctions hit is:",
      "options": ["Required — the client has a right to know", "Prohibited — tipping off is a criminal offence under the PCMLTFA", "Permitted if done in writing only", "Required only if the client specifically asks"],
      "answer": 1
    },
    {
      "question": "The TPR is filed through:",
      "options": ["The BoC's PSPConnect portal", "Email directly to OSFI", "FINTRAC's F2R reporting portal", "A paper form mailed to FINTRAC's Ottawa office"],
      "answer": 2
    },
    {
      "question": "After freezing funds on a confirmed sanctions match, eFinMoney must also notify:",
      "options": ["The RCMP National Security unit", "OSFI's Financial Intelligence and Protection unit", "The client's home country regulator", "Canada Revenue Agency"],
      "answer": 1
    },
    {
      "question": "Why is weekly manual download of sanctions lists insufficient?",
      "options": ["FINTRAC requires automated downloads only", "OFAC and OSFI can add new designations at any time — a weekly download leaves a 7-day unscreened window", "Manual downloads are too expensive", "OSFI prohibits manual list management for MSBs"],
      "answer": 1
    },
    {
      "question": "A client calls asking why their transfer has not been processed. A sanctions hold is in place. Staff should:",
      "options": ["Explain that a sanctions hit has been identified and request more documentation", "Tell the client the transaction is under review and they will be contacted by the compliance team — without revealing the reason", "Transfer the call to the compliance officer who can explain the situation in full", "Tell the client there is a technical issue and the funds will be sent tomorrow"],
      "answer": 1
    },
    {
      "question": "Annual sanctions screening testing should confirm:",
      "options": ["That no clients have been designated this year", "That known designated persons entered into a test environment are flagged by the system", "That all cleared hits were reviewed by OSFI", "That the compliance officer has read the sanctions policy"],
      "answer": 1
    }
  ]$qz_fe1$::jsonb,
  $res_fe1$[
    {"label": "FINTRAC — Guide 5: Reporting Listed Persons", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/Guide5/5-eng", "type": "Official Guidance"},
    {"label": "OSFI — Consolidated Designated Persons List", "url": "https://www.osfi-bsif.gc.ca/en/security-safety/consolidated-designated-persons-list", "type": "Official Guidance"},
    {"label": "Global Affairs Canada — Consolidated Sanctions List", "url": "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx", "type": "Official Guidance"},
    {"label": "PCMLTFA — Terrorist Property Reporting (s.7.1)", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html", "type": "Statute"}
  ]$res_fe1$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-E2  Privacy, PIPEDA & Data Stewardship
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Privacy, PIPEDA & Data Stewardship',
  'compliance', 'fintrac_elective', false, 24, 40, 70,
  'All staff',
  'How Canada''s privacy law (PIPEDA) applies to eFinMoney client data — collection principles, the PCMLTFA retention conflict, breach reporting, cross-border transfer safeguards, and staff data-handling duties.',
  $sm_fe2$[
    {
      "title": "Canada's Privacy Framework — PIPEDA and Its Ten Principles",
      "body": "The Personal Information Protection and Electronic Documents Act (PIPEDA) governs how private-sector organisations in Canada collect, use, and disclose personal information in the course of commercial activities. PIPEDA is built around ten fair information principles: Accountability (designate a privacy officer); Identifying Purposes (tell people why data is collected before collection); Consent (obtain meaningful consent); Limiting Collection (collect only what is necessary); Limiting Use, Disclosure and Retention (use data only for the stated purpose); Accuracy (keep records current); Safeguards (protect data with appropriate security); Openness (publish your privacy policy); Individual Access (respond to access requests); and Challenging Compliance (clients may complain to the Privacy Commissioner). Note: Canada is transitioning toward the Consumer Privacy Protection Act (CPPA / Bill C-27), which will replace PIPEDA. Staff should follow current PIPEDA requirements and watch for CPPA updates."
    },
    {
      "title": "Lawful Collection of Client Data — When PCMLTFA Overrides Consent",
      "body": "PIPEDA generally requires client consent before collecting personal information. However, PIPEDA contains an exception for legal obligations: where a law requires collection of personal information without consent, the organisation may collect it without the client's agreement. This exception covers eFinMoney's PCMLTFA obligations: collecting government-issued ID at the $1,000 threshold for funds transfers, collecting date of birth and address for client verification, and retaining transaction records. Staff should understand that the PCMLTFA collection obligation is law — if a client refuses to provide identification required at threshold, the transaction cannot proceed, and refusal itself may be an ML/TF indicator worth documenting. eFinMoney should still be transparent about data collection in its privacy notice, even where consent is not required."
    },
    {
      "title": "The Retention Conflict — PCMLTFA 5 Years vs. PIPEDA Erasure",
      "body": "PIPEDA's retention principle requires organisations to retain personal information only as long as necessary for the stated purpose. When a client relationship ends, PIPEDA suggests the data should be deleted. However, PCMLTFA s.6 and the PCMLTFR require eFinMoney to retain client identification records and transaction records for five years from the date of the record or from the date the business relationship ends (for ongoing relationships). These two obligations directly conflict for a departing client. The resolution is clear: the PCMLTFA statutory obligation takes precedence — records that are required to be retained by federal AML law cannot be erased at a client's request during the retention period. eFinMoney's privacy notice should explicitly disclose this conflict and explain that certain records are retained pursuant to PCMLTFA obligations regardless of consent."
    },
    {
      "title": "Data Breach Response — PIPEDA's Breach Reporting Obligations",
      "body": "PIPEDA's breach of security safeguards regulations (in force since November 2018) require organisations to: (1) Maintain a record of every privacy breach involving personal information — regardless of whether the breach is notifiable. Records must be retained for 24 months. (2) Report to the Office of the Privacy Commissioner (OPC) any breach that creates a real risk of significant harm (RROSH) to an individual. A breach creates RROSH if the information could lead to identity theft, financial loss, damage to reputation, physical harm, or humiliation. (3) Notify affected individuals of any RROSH breach — notification must describe what happened, what information was involved, what risk the individual faces, and what eFinMoney is doing to mitigate harm. Notification must be given 'as soon as feasible.' In the context of eFinMoney's RPAA ORM obligations, a data breach may also trigger BoC incident notification — the two timelines must be managed simultaneously."
    },
    {
      "title": "Cross-Border Data Transfer — Sending Client Data to Nigeria and Zambia",
      "body": "When eFinMoney shares client data with correspondent agents, beneficiary banks, or compliance service providers in Nigeria or Zambia, those transfers are cross-border transfers of personal information. PIPEDA does not prohibit cross-border transfers but requires that: (1) The recipient provides 'comparable protection' to Canadian privacy standards — this is typically achieved through a written data processing agreement (DPA) specifying the purpose of the transfer, the data categories transferred, security requirements, and the obligation to notify eFinMoney of any breach of the transferred data. (2) The privacy notice discloses that data may be transferred to foreign jurisdictions. (3) The DPA is in place before any transfer — not a retroactive arrangement. Staff handling data sharing with overseas partners should ensure the DPA is on file and reviewed by the compliance officer before data is sent. Sending client data by unencrypted email to a foreign counterpart, even a trusted one, is a safeguard failure."
    },
    {
      "title": "Staff Data-Handling Obligations",
      "body": "Every staff member who accesses client personal information has a personal obligation under PIPEDA (as agents of the organisation). Practical rules: (1) Need to know — access only the client data necessary for your specific job function. A customer service agent who handles a remittance inquiry does not need access to the client's full KYC history or transaction records from 3 years ago. (2) Clean desk — client records, printed ID copies, or transaction reports must not be left unattended on desks or in shared spaces. (3) Screen locking — computers and phones must be locked when unattended. (4) Personal devices — client data must not be stored on personal phones, personal email, or personal cloud storage. (5) Verbal confidentiality — discussions about specific clients must not occur in public spaces where they could be overheard. A data breach caused by a staff member's carelessness (e.g., emailing a client transaction report to the wrong address) is a PIPEDA violation that eFinMoney is responsible for."
    },
    {
      "title": "Individual Access Rights and How to Handle Them",
      "body": "Under PIPEDA, any individual has the right to request access to their personal information held by eFinMoney and to request correction of inaccurate information. Access requests must be responded to within 30 days (with one possible extension of up to 30 more days for complex requests). The response must: identify the information held; describe how it has been used; identify any third parties to whom it has been disclosed. eFinMoney may refuse to disclose information that would reveal the personal information of a third party, information protected by solicitor-client privilege, or information that would compromise an ongoing FINTRAC investigation. If a request is refused in whole or in part, the refusal must explain the reason. Clients who are dissatisfied with a response may file a complaint with the Office of the Privacy Commissioner (OPC). Staff who receive a written access request should immediately route it to the compliance officer — do not attempt to respond without guidance."
    }
  ]$sm_fe2$::jsonb,
  $qz_fe2$[
    {
      "question": "PIPEDA requires collection of personal information to be:",
      "options": ["As comprehensive as possible to support future needs", "Limited to what is necessary for the identified purpose", "Disclosed to FINTRAC at collection", "Retained indefinitely for audit purposes"],
      "answer": 1
    },
    {
      "question": "eFinMoney can collect client ID without consent under PIPEDA because:",
      "options": ["Financial institutions are exempt from PIPEDA entirely", "The PCMLTFA creates a legal obligation that overrides the consent requirement", "eFinMoney's privacy policy says so", "FINTRAC has pre-authorised all collection"],
      "answer": 1
    },
    {
      "question": "A client who ends their relationship with eFinMoney requests that all their data be deleted. Records required by PCMLTFA must:",
      "options": ["Be deleted immediately upon request", "Be retained for the 5-year PCMLTFA period — the statutory obligation overrides the erasure request", "Be deleted after 30 days if the client provides written confirmation", "Be transferred to FINTRAC for safekeeping"],
      "answer": 1
    },
    {
      "question": "A privacy breach that creates a real risk of significant harm to an individual must be reported to:",
      "options": ["FINTRAC, within 30 days", "OSFI, within 72 hours", "The Office of the Privacy Commissioner (OPC), as soon as feasible", "The Bank of Canada, within 24 hours"],
      "answer": 2
    },
    {
      "question": "Before sharing client data with a correspondent agent in Nigeria, eFinMoney must:",
      "options": ["Obtain explicit consent from every affected client", "Have a written data processing agreement in place specifying purpose, security, and breach notification obligations", "File a notice with the OPC", "Confirm the Nigerian regulator approves the transfer"],
      "answer": 1
    },
    {
      "question": "The 'need to know' principle for staff data access means:",
      "options": ["All staff may access all client records to best serve clients", "Staff may only access the client data necessary for their specific job function", "Senior managers may share access credentials with junior staff", "Access controls only apply to financial records, not identification records"],
      "answer": 1
    },
    {
      "question": "The timeframe for responding to a client's access request under PIPEDA is:",
      "options": ["7 days", "14 days", "30 days (with one possible 30-day extension)", "60 days without exception"],
      "answer": 2
    },
    {
      "question": "A staff member accidentally emails a client's transaction history to the wrong recipient. This is:",
      "options": ["Not a breach if the recipient deletes the email", "A privacy breach — eFinMoney must assess whether it creates RROSH and, if so, report to the OPC and notify the affected client", "Only a breach if the recipient forwards the email to a third party", "Only reportable if the client complains"],
      "answer": 1
    },
    {
      "question": "Client data must not be stored on:",
      "options": ["eFinMoney's encrypted business server", "Personal phones, personal email, or personal cloud storage accounts", "Encrypted USB drives provided by the IT department", "Password-protected internal systems"],
      "answer": 1
    },
    {
      "question": "The federal privacy regulator that receives PIPEDA breach reports and access complaints is:",
      "options": ["FINTRAC", "OSFI", "The Office of the Privacy Commissioner of Canada (OPC)", "The Bank of Canada"],
      "answer": 2
    }
  ]$qz_fe2$::jsonb,
  $res_fe2$[
    {"label": "OPC — PIPEDA Overview", "url": "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/guide_org/", "type": "Official Guidance"},
    {"label": "OPC — Privacy Breach Reporting", "url": "https://www.priv.gc.ca/en/privacy-topics/privacy-breaches/respond-to-a-privacy-breach-at-your-business/", "type": "Official Guidance"},
    {"label": "PIPEDA — Full Text", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html", "type": "Statute"}
  ]$res_fe2$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-E3  Fraud Awareness & Internal Controls
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Fraud Awareness & Internal Controls',
  'compliance', 'fintrac_elective', false, 24, 40, 70,
  'All staff',
  'Recognising external fraud (identity theft, account takeover) and internal fraud red flags, applying separation of duties, cash controls, and understanding when fraud overlaps with AML reporting obligations.',
  $sm_fe3$[
    {
      "title": "Types of Fraud Relevant to eFinMoney Operations",
      "body": "eFinMoney's business model — receiving cash, processing remittances, and moving funds internationally — is attractive to several fraud typologies. External fraud: (1) Identity fraud — a fraudster uses stolen or fabricated ID to open an account or initiate a transaction, with the victim's real identity unaware. (2) Account takeover — a fraudster uses stolen credentials (username/password) to log into a legitimate client's account and initiate unauthorised transfers. (3) Beneficiary fraud — a client is deceived into sending funds to a fraudster (romance scam, advance-fee fraud, business email compromise); the client is a victim, not a fraudster. Internal fraud: (4) Embezzlement — a staff member diverts client funds or company cash for personal benefit. (5) False transaction entry — a staff member creates fictitious transactions to generate unauthorised payments. (6) Collusion fraud — two or more staff members cooperate to override controls that either could not defeat alone. Understanding which type of fraud occurred matters because the response, escalation, and AML implications differ."
    },
    {
      "title": "Red Flags for Internal Fraud",
      "body": "Internal fraud is often committed by trusted, long-serving employees who have accumulated system access, process knowledge, and relationship capital. Classic red flags: (1) The 'indispensable employee' — someone who never takes vacation, refuses to train a replacement, and insists on handling certain processes personally. Absence from the role is itself the control; if one person is the only one who knows a process, that process has no oversight. (2) Lifestyle changes inconsistent with salary — new luxury purchases, unexplained debts being paid off, or living beyond apparent means without explanation. (3) Unusual after-hours system access — logging into transaction systems late at night or on weekends when no legitimate business requires it. (4) Frequent small cash discrepancies — individually explainable, but trending in one direction over time. (5) Resistance to audits or system changes that would increase oversight — legitimate staff generally welcome controls; those with something to hide resist them."
    },
    {
      "title": "Separation of Duties — The Core Internal Control",
      "body": "Separation of duties (SoD) is the principle that no single person should have control over every step of a critical process. In a remittance context: the staff member who collects cash from the client should not be the same person who enters the transaction into the system. The staff member who enters the transaction should not be the same person who approves it. The staff member who approves the transaction should not be the same person who reconciles the till at end of day. When one person controls all three steps, they can collect cash, enter a lower amount in the system, pocket the difference, and reconcile to the lower figure — with no control catching the manipulation. In a small team where perfect SoD is difficult, at minimum: daily work should be reviewed by a different person; reconciliations should be performed by someone who did not handle the cash; and all system access should be individual (no shared logins)."
    },
    {
      "title": "Cash Handling Controls",
      "body": "Cash is the highest-risk asset in eFinMoney's operations — untraceable once removed from a till, and easily manipulated at the point of collection. Controls: (1) Dual custody — whenever cash above a set threshold (e.g., $500) is counted, moved, or stored, two staff members must be present and both must sign the count record. (2) Daily till reconciliation — every cash till is reconciled daily against the transaction system's cash-in record. Variances above a de minimis threshold (e.g., $5) must be investigated and documented, not simply rounded off. (3) Surprise cash audits — periodically and without advance notice, a manager or compliance officer counts a specific till and compares to the expected balance. The unpredictability of surprise audits is what gives them deterrent value. (4) Sequential receipt numbering — every cash transaction is recorded with a pre-printed sequential receipt number; gaps in the sequence prompt investigation. (5) CCTV at cash-handling stations — a deterrent and an investigative resource."
    },
    {
      "title": "Account Takeover and Identity Fraud — Recognising the Signs",
      "body": "Account takeover (ATO) involves a fraudster gaining unauthorised access to a legitimate client's account and sending funds to a fraudster-controlled beneficiary. Red flags at point of transaction: (1) Login from an unfamiliar device or geographic location not consistent with the client's usual pattern. (2) Change of beneficiary immediately followed by a large transfer — the fraudster changes the recipient and immediately moves funds. (3) Urgency requests — an account that normally transacts weekly suddenly processes multiple transactions in a single day with urgency messages. (4) Client-reported unfamiliar transactions — the legitimate client calls to report they did not initiate a transfer. Identity fraud red flags: (1) ID document that appears laminated over, discoloured at the photo, or with inconsistent fonts. (2) Client cannot recall information consistent with the ID (e.g., cannot spell the address on the card). (3) Different person from the photo — request a second form of ID and apply a live-presence test if in person."
    },
    {
      "title": "Whistleblowing and Reporting Suspected Fraud",
      "body": "Staff who suspect fraud — whether committed by a client or a colleague — have an obligation to report. Internal reporting channels: first, report to the compliance officer. If the fraud appears to involve the compliance officer, report directly to senior management or the board. eFinMoney's whistleblowing policy must protect staff who report in good faith from retaliation. Canada does not currently have a comprehensive private-sector whistleblower protection statute, but internal policy protection is the minimum standard. In cases of confirmed internal fraud, eFinMoney must also consider: (1) Regulatory notification — if the fraud resulted in a material operational loss or compromised client funds, it may be notifiable to FINTRAC (as a compliance-impacting event) or to the BoC (as an operational incident). (2) Law enforcement referral — significant internal fraud should be referred to the RCMP's Commercial Crime Section. Staff who bypass internal channels and go directly to media or regulators without attempting internal reporting first are not protected under most existing frameworks, but courts generally protect good-faith reporters."
    },
    {
      "title": "When Fraud Overlaps with AML Obligations",
      "body": "Fraud and money laundering frequently intersect — proceeds of fraud are money that must be laundered before it can be used without detection. Two important scenarios: (1) A client who is a victim of fraud initiates a transfer to a fraudster — the client has no AML concern, but the fraudster may be using eFinMoney to layer the proceeds of fraud into the international payment system. eFinMoney may file an STR on the beneficiary side even though the client is an innocent victim. (2) A client who is committing fraud (identity theft, account takeover, Ponzi scheme) uses eFinMoney to move proceeds. In this case, eFinMoney is at risk of being used as a money laundering vehicle and must file an STR when reasonable grounds exist. Important rule: if an STR is filed, staff must not tell the client — the tipping-off prohibition applies to STRs filed in fraud-linked cases exactly as in pure AML cases."
    }
  ]$sm_fe3$::jsonb,
  $qz_fe3$[
    {
      "question": "Separation of duties means that:",
      "options": ["Each staff member handles all steps of a transaction from start to finish for continuity", "No single person controls every step of a critical process — collection, entry, approval, and reconciliation should involve different people", "Senior managers may approve their own transactions if no other approver is available", "SoD only applies to transactions above $10,000"],
      "answer": 1
    },
    {
      "question": "An employee who never takes vacation, resists cross-training, and insists on handling certain processes alone is:",
      "options": ["A model employee demonstrating dedication", "Displaying a classic internal fraud red flag — sole process control removes oversight", "Only a concern if cash discrepancies have been found", "A low-risk profile if they have been employed for many years"],
      "answer": 1
    },
    {
      "question": "Dual custody for cash handling means:",
      "options": ["Two managers must approve all client transactions", "Two staff members must be present when cash is counted, moved, or stored, and both sign the count record", "Cash can be handled by one person if they are bonded", "The client must be present for all cash counts"],
      "answer": 1
    },
    {
      "question": "A till variance at end of day should be:",
      "options": ["Rounded to the nearest dollar and not recorded", "Investigated and documented — any variance above a de minimis threshold requires explanation", "Reported to FINTRAC as a suspicious transaction", "Covered from petty cash without documentation"],
      "answer": 1
    },
    {
      "question": "Account takeover fraud typically begins with:",
      "options": ["The client applying for a second account", "A fraudster gaining unauthorised access to a legitimate client's credentials and initiating transfers to fraudster-controlled accounts", "A client increasing their transaction frequency", "A beneficiary requesting funds directly from eFinMoney"],
      "answer": 1
    },
    {
      "question": "A client presents an ID with a photo that appears laminated over and inconsistent fonts. Staff should:",
      "options": ["Accept it if the name matches what the client says verbally", "Decline the transaction, document the suspicious document, and escalate to compliance", "Request a second ID only if the first ID is a driver's licence", "Process the transaction and file an LCTR"],
      "answer": 1
    },
    {
      "question": "The primary deterrent value of surprise cash audits is:",
      "options": ["Their ability to detect discrepancies for the current day only", "Their unpredictability — staff cannot time fraudulent activity around a known audit schedule", "Their cost-effectiveness compared to CCTV", "Their ability to replace daily till reconciliations"],
      "answer": 1
    },
    {
      "question": "A client who has been a fraud victim sends funds to a fraudster's account. eFinMoney may:",
      "options": ["Take no action — the client is the victim, not the fraudster", "File an STR on the beneficiary side if there are reasonable grounds to suspect the receiving account is involved in money laundering", "Return the funds immediately without investigation", "Report the client to FINTRAC as a fraudster"],
      "answer": 1
    },
    {
      "question": "When a staff member suspects a colleague of committing fraud, the first step is to:",
      "options": ["Confront the colleague directly", "Report to the compliance officer — or to senior management if the colleague is the compliance officer", "Report immediately to the RCMP", "Document and wait to see if the pattern continues"],
      "answer": 1
    },
    {
      "question": "If an STR is filed after discovering fraud-linked activity, staff must:",
      "options": ["Inform the client so they can assist the investigation", "Not disclose to the client that a report has been or may be filed — the tipping-off prohibition applies", "Immediately freeze the client's account without explanation", "Copy the STR to the client's legal representative"],
      "answer": 1
    }
  ]$qz_fe3$::jsonb,
  $res_fe3$[
    {"label": "FINTRAC — ML/TF Indicators for MSBs", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Reporting Suspicious Transactions", "url": "https://fintrac-canafe.gc.ca/reporting-declaration/str-deo/str-deo-eng", "type": "Official Guidance"}
  ]$res_fe3$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-E4  Advanced ML/TF Typologies for Remittances
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Advanced ML/TF Typologies for Remittances',
  'compliance', 'fintrac_elective', false, 24, 45, 70,
  'Compliance and operations staff',
  'Deep dive into ML/TF typologies specific to remittance corridors — trade-based ML, hawala, virtual currency convergence, human trafficking indicators, PEP-linked flows, and emerging patterns.',
  $sm_fe4$[
    {
      "title": "Trade-Based Money Laundering in a Remittance Context",
      "body": "Trade-based money laundering (TBML) exploits international trade to move value across borders. In a remittance context, TBML typically works as follows: a criminal instructs an import business in Canada to over-invoice for goods imported from Nigeria or Zambia (e.g., invoice says $50,000 for 500 units; actual market value is $10,000). The Canadian importer remits $50,000 — which looks like a legitimate trade payment — and the Nigerian exporter keeps the $40,000 excess as laundered funds. FINTRAC has identified specific TBML red flags relevant to MSBs: remittance amounts that are unusually large for the stated purpose; clients who describe transactions as trade payments but cannot name specific goods, quantities, or counterparties; clients whose stated occupation is inconsistent with their transaction volume; and single transactions to multiple beneficiaries at the same overseas institution in the same day."
    },
    {
      "title": "Hawala and Informal Value Transfer Systems",
      "body": "Hawala is an informal value transfer system that operates on trust and offsetting obligations rather than physical movement of money. A sender in Canada pays a hawaladar (broker) CAD $5,000 with the instruction to deliver an equivalent in Naira to a beneficiary in Lagos. The Canadian hawaladar calls the Lagos hawaladar, who pays out from their own reserve funds. The two hawaladars settle their net obligations periodically — often through legitimate remittance channels, gold, or physical cash. No formal record of the original transaction exists in any regulated system. The ML risk: eFinMoney's services may be used by hawaladars to settle inter-broker obligations. Red flags: a client who regularly sends near-identical amounts to the same overseas account at regular intervals with no clear personal relationship to the beneficiary; a client who uses eFinMoney for round-number transactions but refuses to explain the purpose; multiple clients sending to the same overseas account."
    },
    {
      "title": "Virtual Currency and Remittance Convergence",
      "body": "The combination of virtual currency and remittances creates a layering opportunity that exploits the limitations of both systems. A classic convergence typology: (1) Criminal deposits cash proceeds with a Bitcoin exchange in Canada, converting cash to Bitcoin. (2) Bitcoin is transferred to a non-custodial wallet or a peer-to-peer platform, breaking the blockchain trail through mixing or rapid swapping to other coins (chain hopping). (3) The Bitcoin is converted back to fiat (Naira or Kwacha) through an overseas unregulated exchange. (4) The fiat is deposited into a Nigerian or Zambian bank account, from which the criminal withdraws it as clean funds. eFinMoney's exposure: if clients deposit cash for a 'remittance' but the funds are ultimately converted to VC by a downstream partner. Red flags: cash deposits immediately followed by VC purchases; large value VC transactions with beneficiaries at unregulated overseas exchanges."
    },
    {
      "title": "Human Trafficking Financial Indicators",
      "body": "Human trafficking — both sex trafficking and labour trafficking — generates proceeds that are laundered through legitimate payment systems including remittance services. FINTRAC has published specific ML/TF indicators for human trafficking. Indicators relevant to eFinMoney: (1) Multiple third parties (often of the same gender and age) visiting the same sender, who appears to manage the others' transactions. (2) Frequent, regular, small sends (e.g., weekly $200) to the same overseas beneficiary, with transactions that follow a rigid script-like pattern. (3) The sender appears coached, nervous, or monitored by another person. (4) Sends to hotels, motels, or accommodation addresses — not to personal addresses. (5) Clients who cannot speak for themselves (translations being provided by the accompanying person). (6) Inconsistent stories about the purpose of the funds. These indicators do not prove trafficking — they are signals that warrant enhanced attention, documentation, and potential STR escalation."
    },
    {
      "title": "Corruption Proceeds and PEP-Linked Remittances",
      "body": "Politically Exposed Persons who abuse their positions can generate large sums of corruption proceeds (bribery, embezzlement, procurement fraud) that must be laundered before use. Remittances are one channel, especially if the PEP has family or business interests in the destination country. Typologies: (1) A PEP sends recurring large-value transfers to a personal account in the destination country that is nominally a family member's — structuring the sends to avoid obvious round numbers. (2) A PEP uses a shell company or trust in the destination country as the beneficiary, obscuring the personal benefit. (3) A PEP sends to a law firm's trust account (lawyer-client trust accounts are a well-known ML tool because they resist disclosure). (4) Layering through multiple jurisdictions — funds sent first to a lower-scrutiny country before final destination. EDD for PEPs must include source of funds and source of wealth, not just identity verification."
    },
    {
      "title": "Structuring and Aggregation Evasion",
      "body": "Structuring — breaking up transactions deliberately to avoid reporting thresholds — is a criminal offence under the PCMLTFA independent of whether the underlying funds are from criminal activity. eFinMoney-specific structuring patterns: (1) A client makes three or more transactions in the same day or week, each slightly below $10,000 (LCTR) or $1,000 (Travel Rule/EFTR) — sometimes to the same beneficiary, sometimes to different ones. (2) Multiple different senders (potentially using different IDs at the same address) sending to the same overseas beneficiary — suggesting a coordinator is splitting one large transfer across nominal senders. (3) A client sends just below threshold amounts on alternating days in a rolling 7-day window, attempting to stay below any 7-day aggregation rules the MSB might run. The 24-hour aggregation rule for LCTRs is a legal minimum — eFinMoney's monitoring may apply wider windows for higher-risk clients or corridors."
    },
    {
      "title": "Emerging Typologies — Mobile Money, Digital Wallets, and A2A Layering",
      "body": "ML/TF typologies evolve as payment systems evolve. Emerging patterns eFinMoney staff should watch for: (1) Mobile money integration — funds are collected in Canada, transferred to a mobile money wallet in Nigeria or Zambia (e.g., M-Pesa, Airtel Money), and immediately split across multiple sub-wallets to obscure the chain. (2) Digital wallet layering — a sender sends to an overseas digital wallet (not a bank account), from which the recipient immediately transfers to multiple other wallets before cashing out. There is no banking record of the final destination. (3) Account-to-account (A2A) transfer chains — multiple accounts at different institutions are used in sequence; each receives funds from the prior account and forwards to the next, creating a layered chain that is difficult to trace without cooperation from every intermediary. (4) Synthetic identity fraud — a fraudster creates a plausible but fictional identity, passes KYC at multiple MSBs, and uses each account for a small number of transactions before abandoning it. eFinMoney should update its monitoring rules as new typologies emerge in FINTRAC guidance."
    }
  ]$sm_fe4$::jsonb,
  $qz_fe4$[
    {
      "question": "Trade-based money laundering in a remittance context typically involves:",
      "options": ["Using remittances to pay for legitimate imported goods", "Manipulating trade invoices to move value disguised as a legitimate trade payment — e.g., over-invoicing to transfer excess funds to the exporter", "Filing false LCTR reports to create a paper trail", "Structuring transactions to avoid the Travel Rule"],
      "answer": 1
    },
    {
      "question": "A hawaladar uses eFinMoney to send a large round-number transfer to the same overseas account weekly. The ML concern is:",
      "options": ["There is no concern — regular transfers are normal for remittance clients", "eFinMoney may be being used to settle inter-broker hawala obligations, with no formal record of the original informal transactions", "The concern is only if the amount exceeds $10,000", "Hawala is legal in Canada and carries no AML risk"],
      "answer": 1
    },
    {
      "question": "Virtual currency and remittance convergence is a ML risk because:",
      "options": ["Virtual currency is banned in Canada", "VC allows criminals to break the transaction chain through conversion and chain hopping, obscuring the origin of funds before converting back to fiat", "All VC transactions are automatically reported to FINTRAC", "VC exchanges are all regulated MSBs with full KYC"],
      "answer": 1
    },
    {
      "question": "A human trafficking indicator at the point of a remittance transaction is:",
      "options": ["The client is a regular, long-standing account holder", "Multiple third parties visiting with the same sender, who appears to manage their transactions, with scripted send patterns to hotel addresses", "The client sends to a family member's address", "The client requests a paper receipt"],
      "answer": 1
    },
    {
      "question": "Structuring is defined as:",
      "options": ["Submitting large transactions to multiple MSBs simultaneously", "Deliberately breaking up transactions to avoid reporting thresholds — a criminal offence under the PCMLTFA regardless of whether the funds are from crime", "Filing transactions in multiple currencies to take advantage of exchange rates", "Sending to multiple beneficiaries in the same country"],
      "answer": 1
    },
    {
      "question": "EDD for a PEP who sends large transfers to a shell company in a destination country must include:",
      "options": ["Only verification of the PEP's identity documents", "Source of funds and source of wealth — understanding where the transferred amount comes from and the PEP's overall financial position", "A credit check on the beneficiary shell company", "FINTRAC pre-approval for each transaction"],
      "answer": 1
    },
    {
      "question": "Multiple different senders with the same home address each sending slightly below $10,000 to the same overseas beneficiary is a red flag for:",
      "options": ["Legitimate family group sending to a shared relative", "Coordinated structuring — a coordinator splitting one large transfer across nominal senders to avoid the LCTR threshold", "Hawala settlement activity", "Trade-based money laundering"],
      "answer": 1
    },
    {
      "question": "Mobile money layering is concerning because:",
      "options": ["Mobile money is banned in Nigeria and Zambia", "Funds sent to a mobile money wallet can be immediately split across multiple sub-wallets, making the final destination difficult to trace", "Mobile money is exempt from PCMLTFA reporting", "Mobile money operators are required to report to FINTRAC directly"],
      "answer": 1
    },
    {
      "question": "When a new ML/TF typology appears in FINTRAC guidance, eFinMoney should:",
      "options": ["Wait for a FINTRAC examination to identify if the typology is relevant", "Review and update the monitoring rules and risk assessment to incorporate the new typology", "File an STR for all clients who match the new typology description", "Request FINTRAC's written confirmation before applying the typology"],
      "answer": 1
    },
    {
      "question": "A client who cannot speak for themselves, with another person providing translations and appearing to manage the transaction, is a potential indicator of:",
      "options": ["A legitimate interpreter service", "Human trafficking — the third party may be controlling the client and managing the movement of trafficking proceeds", "A corporate client using a translator", "A PEP using a personal assistant"],
      "answer": 1
    }
  ]$qz_fe4$::jsonb,
  $res_fe4$[
    {"label": "FINTRAC — ML/TF Indicators for MSBs", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/msb_mltf-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Indicators of Human Trafficking", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/indicators-indicateurs/human_trafficking-traite_personnes-eng", "type": "Official Guidance"},
    {"label": "FATF — Trade-Based Money Laundering", "url": "https://www.fatf-gafi.org/en/publications/Methodsandtrends/Trade-based-money-laundering.html", "type": "Official Guidance"}
  ]$res_fe4$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-E5  Compliance Culture & Ethics
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Compliance Culture & Ethics',
  'compliance', 'fintrac_elective', false, 24, 35, 70,
  'All staff',
  'Building a genuine compliance culture — tone from the top, tipping-off prohibition, conflicts of interest, escalation mindset, FINTRAC reporter protections, and ethical decision-making in practice.',
  $sm_fe5$[
    {
      "title": "What Compliance Culture Actually Means",
      "body": "Compliance culture is the collective attitude of an organisation toward following rules — not because regulators might be watching, but because it is the right way to operate. An organisation with a strong compliance culture has staff who: understand why the rules exist and what harm they prevent; feel comfortable raising concerns without fear of retaliation; escalate uncertain situations rather than resolving them alone; and treat compliance as a shared responsibility rather than the compliance team's problem. An organisation with a weak compliance culture has staff who: view compliance as a box-ticking exercise; stay silent about suspicious situations to avoid conflict; follow the letter of a policy while ignoring its purpose; and feel that raising concerns is career-limiting. FINTRAC examiners assess compliance culture — they ask front-line staff what they would do in specific scenarios, and they can identify when policies are documents on paper rather than lived practice."
    },
    {
      "title": "The Tipping-Off Prohibition — An Absolute Rule",
      "body": "The PCMLTFA makes it a criminal offence to disclose to any person that an STR, TPR, or other FINTRAC disclosure has been or may be filed about them. This is the tipping-off prohibition (PCMLTFA s.8). It is absolute — there is no exception for long-standing clients, family members, or situations where the client appears genuinely confused. Examples of tipping off: telling a client that 'I have to report this transaction'; showing a client the STR form or draft; mentioning to a third party that an STR has been filed on a mutual acquaintance; leaving an STR on screen where a client could read it. Not tipping off: telling a client that the transaction is under review and they will be contacted; refusing to answer questions about whether a report was filed; saying 'I cannot discuss the details of your file.' A violation of the tipping-off prohibition can result in criminal charges against the individual staff member, not just eFinMoney."
    },
    {
      "title": "Conflicts of Interest — Recognising and Declaring Them",
      "body": "A conflict of interest exists when a personal interest — financial, relational, or otherwise — could impair objective judgment in performing professional duties. In a compliance context: (1) A relationship conflict — a compliance officer who is a personal friend of a client may be reluctant to recommend an STR when the facts support one. (2) A financial conflict — a staff member who receives volume-based commissions on transactions may be motivated to process questionable transactions to earn their bonus. (3) An outside business conflict — a staff member who runs a side business that competes with eFinMoney or that has clients who also use eFinMoney may have information advantages or loyalty conflicts. The correct response to a conflict of interest is to declare it — to the compliance officer or supervisor — and recuse from the decision. Failing to declare a known conflict is itself an integrity violation. eFinMoney's conflict of interest policy should require annual declarations and trigger reviews."
    },
    {
      "title": "The Escalation Mindset — When in Doubt, Ask",
      "body": "Front-line staff often encounter ambiguous situations: a transaction that feels wrong but has a plausible explanation; a client who is evasive but presents a valid ID; a pattern that is unusual but not clearly suspicious. The escalation mindset is the answer to every one of these: when in doubt, escalate. The compliance officer is there precisely to handle these grey-area situations. The cost of a false escalation (compliance officer spends 10 minutes and determines everything is fine) is negligible. The cost of a missed escalation (a suspicious transaction is processed without review, and it later turns out to be money laundering) can be regulatory findings, reputational damage, or criminal liability. Staff should understand that escalating is never career-limiting — it is exactly what eFinMoney expects and protects. What is career-limiting is processing a transaction that later turns out to be suspicious without having escalated the concern."
    },
    {
      "title": "FINTRAC Protections for Reporters",
      "body": "Canada's PCMLTFA provides important protections to staff who file FINTRAC reports in good faith: (1) Civil immunity — under s.10.1 of the PCMLTFA, a person who in good faith files an STR or takes other action required by the Act is not civilly liable for doing so. This means the client cannot sue eFinMoney or the individual staff member for filing an STR about them, even if the STR ultimately does not lead to any prosecution. (2) Confidentiality of the reporter — neither the fact of filing nor the content of the report is disclosed by FINTRAC to the subject of the report. FINTRAC uses reports as financial intelligence, not as evidence in adversarial proceedings. Staff should feel reassured by these protections: filing an STR in good faith carries zero legal risk to the individual. Failing to file when reasonable grounds exist, on the other hand, exposes both eFinMoney and potentially the individual compliance officer to regulatory and criminal consequences."
    },
    {
      "title": "Hierarchy Pressure and the Individual Obligation to Report",
      "body": "One of the most ethically challenging situations a compliance staff member can face is pressure from a manager or executive not to file an STR. Perhaps the client is a large revenue generator, a personal connection, or politically prominent. The PCMLTFA does not permit hierarchy to override the individual reporting obligation. Under s.7 of the PCMLTFA, the obligation to file an STR when reasonable grounds exist is an obligation of the reporting entity — and the compliance officer is designated to fulfil it. A compliance officer who is pressured not to file and complies with that pressure is personally in violation of the PCMLTFA. If a compliance officer faces this pressure, the correct steps are: (1) Document the pressure in writing. (2) File the STR in any event — the legal obligation is not subject to management override. (3) Report the pressure to the board or, if the board is involved, to FINTRAC's tip line or legal counsel. Staff who face this situation must know that eFinMoney's compliance culture protects them."
    },
    {
      "title": "Ethics in Practice — Scenario-Based Thinking",
      "body": "Compliance ethics is most meaningfully learned through scenarios. Consider: (1) A long-standing client sends an unusually large transfer and explains it as an inheritance from a recently deceased parent. The explanation is plausible but unverified. What do you do? — Document the explanation, ask for supporting evidence (death certificate, probate document), and escalate to the compliance officer to assess whether an STR is warranted if evidence is not forthcoming. (2) A colleague processes a cash transaction and asks you to enter it in the system under your login 'because they're in a rush.' What do you do? — Refuse. Shared system access makes accountability impossible and is a control failure. (3) A client who is a friend of the branch manager wants their transaction processed without the usual ID check 'as a favour.' What do you do? — Refuse and escalate. No personal relationship excuses a regulatory obligation. The pattern across all three: document, escalate, apply the rules consistently regardless of the identity of the person involved."
    }
  ]$sm_fe5$::jsonb,
  $qz_fe5$[
    {
      "question": "A genuine compliance culture is characterised by:",
      "options": ["Staff who follow policies only during examination periods", "Staff who understand why rules exist, escalate concerns without fear, and treat compliance as a shared responsibility", "A large dedicated compliance team that handles all compliance decisions", "Policies that are comprehensive and cover every possible scenario"],
      "answer": 1
    },
    {
      "question": "The tipping-off prohibition under PCMLTFA s.8 means:",
      "options": ["Staff must not discuss transaction details with clients under any circumstances", "No one may disclose to a person that an STR, TPR, or other FINTRAC report has been or may be filed about them", "Compliance officers must keep all STR filings confidential from other staff", "Staff cannot discuss compliance obligations with clients"],
      "answer": 1
    },
    {
      "question": "Telling a client 'your transaction is under review and you will be contacted by the compliance team' is:",
      "options": ["Tipping off — never say anything about a review", "Acceptable — it is a neutral response that does not disclose the existence of a FINTRAC report", "Required by PIPEDA — clients must be informed of any action taken on their account", "Only acceptable if approved in writing by the compliance officer first"],
      "answer": 1
    },
    {
      "question": "A conflict of interest must be:",
      "options": ["Kept private to avoid awkwardness", "Declared to the compliance officer or supervisor, with the staff member recusing from the related decision", "Managed independently by the staff member with no disclosure required", "Reported to FINTRAC as an STR"],
      "answer": 1
    },
    {
      "question": "The escalation mindset means that when a staff member faces an ambiguous situation, they should:",
      "options": ["Make the best decision they can and proceed without delay", "Escalate to the compliance officer — the cost of a false escalation is negligible versus the cost of a missed concern", "Process the transaction and document their reasoning in the file", "Refuse the transaction and ask the client to return tomorrow"],
      "answer": 1
    },
    {
      "question": "Under PCMLTFA s.10.1, a staff member who files an STR in good faith is protected from:",
      "options": ["Criminal prosecution by the RCMP", "Civil liability — the client cannot sue the individual or eFinMoney for the good-faith filing", "Regulatory examination findings", "Any internal disciplinary action"],
      "answer": 1
    },
    {
      "question": "A manager instructs a compliance officer not to file an STR on a large revenue-generating client. The compliance officer must:",
      "options": ["Follow the manager's instruction — hierarchy takes precedence in operational decisions", "File the STR in any event — the PCMLTFA obligation is not subject to management override — and document the pressure", "Defer the STR filing by 30 days to allow time for management review", "Consult FINTRAC before filing to avoid a conflict"],
      "answer": 1
    },
    {
      "question": "A client asks whether a report has been filed about them. The correct response is:",
      "options": ["Confirm or deny based on what the client already seems to know", "Neither confirm nor deny — the tipping-off prohibition applies regardless of how the question is phrased", "Tell the client to submit a PIPEDA access request to find out", "Refer them to the compliance officer who will decide what to disclose"],
      "answer": 1
    },
    {
      "question": "A colleague asks you to log a cash transaction under your system credentials 'just this once.' The correct response is:",
      "options": ["Help the colleague — it is a minor administrative convenience", "Refuse — shared credentials make individual accountability impossible and constitute a control failure", "Agree but document that the colleague initiated the transaction", "Only agree if the amount is under $1,000"],
      "answer": 1
    },
    {
      "question": "A client who is a branch manager's personal friend requests a transaction without ID verification. The correct action is:",
      "options": ["Process the transaction — trusted long-standing relationships can be exempted from ID requirements", "Refuse and escalate to the compliance officer — no personal relationship overrides the PCMLTFA identification obligation", "Process the transaction but flag it internally for review next week", "Ask a more senior staff member to process it to avoid the confrontation"],
      "answer": 1
    }
  ]$qz_fe5$::jsonb,
  $res_fe5$[
    {"label": "FINTRAC — Tipping Off (PCMLTFA s.8)", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html", "type": "Statute"},
    {"label": "FINTRAC — Compliance Program Guide (Guide 4)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Protection for Reporters (s.10.1)", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html", "type": "Statute"}
  ]$res_fe5$::jsonb,
  '[]'::jsonb
);
