-- ==============================================================
-- Phase 2: Full FINTRAC mandatory course content
-- All facts trace to FINTRAC.gc.ca guidance or PCMLTFA/PCMLTFR.
-- F-01  AML/ATF Fundamentals               — UPDATE 8 lessons 12 Qs
-- F-02  PCMLTFA/PCMLTFR Legislative Dive   — INSERT 8 lessons 12 Qs
-- F-03  Suspicious Transaction Reporting   — UPDATE 9 lessons 13 Qs
-- F-04  Large Cash & EFT Reporting         — INSERT 7 lessons 10 Qs
-- F-05  Travel Rule & Correspondent Banks  — INSERT 7 lessons 10 Qs
-- F-06  Customer Due Diligence & EDD       — INSERT 9 lessons 12 Qs
-- F-07  Record Keeping & Retention         — INSERT 7 lessons 10 Qs
-- F-08  Risk-Based Approach & Compliance   — INSERT 8 lessons 12 Qs
-- ==============================================================

-- ---------------------------------------------------------------
-- F-01  AML/ATF Fundamentals  (UPDATE)
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  study_materials = $sm01$[
    {
      "title": "The Three Stages of Money Laundering",
      "body": "Money laundering converts criminal proceeds into apparently legitimate funds across three stages. Placement introduces illicit cash into the financial system — for example, depositing cash at a currency exchange. Layering uses complex, cross-border transactions to obscure the audit trail: wire transfers between shell companies in multiple jurisdictions are a classic example. Integration reintroduces the funds into the legitimate economy through real estate purchases, luxury goods, or business investments. Understanding each stage helps MSB staff recognise when eFinMoney is being used as a vehicle at any point in the chain. FINTRAC guidance (MSB ML/TF Indicators) lists specific red flags for each stage."
    },
    {
      "title": "Terrorist Financing — Key Distinctions",
      "body": "Terrorist financing (TF) differs from money laundering in one critical respect: the funds may originate from legitimate sources — salary, donations, or legitimate business — but are directed toward financing violence or terrorism. The criminal act is the intended use, not the origin. This distinction matters for MSBs because standard transaction-size controls (e.g., LCTR thresholds) may not catch TF — a $500 wire to a sanctioned country can be more dangerous than a $50,000 legitimate remittance. FINTRAC requires MSBs to apply reasonable measures to detect TF alongside ML, including screening clients and destinations against the OSFI Consolidated list and Global Affairs Canada sanctions."
    },
    {
      "title": "Canada's AML/ATF Regulatory Regime",
      "body": "Canada's AML/ATF framework rests on the Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA) and its Regulations (PCMLTFR). FINTRAC — the Financial Transactions and Reports Analysis Centre of Canada — is the financial intelligence unit created by Part 3 of the PCMLTFA. It collects reports, analyses financial intelligence, and discloses actionable disclosures to law enforcement. FINTRAC does not investigate crimes; it produces intelligence. The RCMP, CSIS, CBSA, and CRA are the downstream users of FINTRAC disclosures. MSBs sit at the reporting-entity end of this chain, feeding the intelligence pool that drives law-enforcement investigations."
    },
    {
      "title": "MSB Registration and Covered Activities",
      "body": "Any entity operating as a Money Services Business in Canada must register with FINTRAC before conducting business. MSB activities under the PCMLTFA include: foreign exchange dealing, remittance (money transferring services), issuing or redeeming money orders or traveller's cheques, dealing in virtual currency, and crowdfunding platforms. Registration must be renewed annually. Operating without a valid FINTRAC registration is an offence under s.54 of the PCMLTFA. eFinMoney is a registered MSB and its registration number must be retained on file. Staff must verify that any third-party MSB partner is also registered — dealing with an unregistered MSB is itself a compliance risk."
    },
    {
      "title": "FINTRAC's Supervisory Powers and AMPs",
      "body": "FINTRAC has broad supervisory powers under Part 3 of the PCMLTFA, including the authority to conduct compliance examinations (announced and unannounced), demand records and information, and issue Administrative Monetary Penalties (AMPs). AMPs can reach $500,000 per violation — the current maximum under the PCMLTFA schedule. Violations can be minor, serious, or very serious, each carrying a different penalty ceiling. Willful or repeated non-compliance can be referred to the Attorney General for criminal prosecution. FINTRAC examinations assess all five elements of the compliance program, not just reporting accuracy. Preparation — current policies, complete records, staff training logs — is essential."
    },
    {
      "title": "The Five Elements of a FINTRAC Compliance Program",
      "body": "Every reporting entity must implement a compliance program with five mandatory elements under PCMLTFR s.9: (1) A designated compliance officer with the authority and resources to implement the program. (2) Written compliance policies and procedures tailored to the entity's activities and risk profile. (3) A risk assessment covering clients, products, delivery channels, and geographic exposure. (4) An ongoing compliance training program for staff who deal with clients or handle transactions. (5) A two-year effectiveness review conducted by an independent reviewer to assess whether the program is working. Missing any element — even if reporting is accurate — constitutes a compliance program deficiency and can trigger penalties."
    },
    {
      "title": "ML/TF Red Flags for MSBs",
      "body": "FINTRAC publishes MSB-specific ML/TF indicator lists that staff must be familiar with. Key red flags include: a client structuring transactions in amounts just below the $10,000 LCTR/EFTR threshold (known as smurfing); a client making multiple cash deposits at different branches; unusual urgency with no business rationale; reluctance to provide identification; sending large amounts to high-risk jurisdictions; inconsistency between the stated purpose and the transaction pattern; and third parties paying on behalf of the client. One red flag alone may not be sufficient for an STR, but combinations — especially involving high-risk countries or unusual frequency — typically cross the 'reasonable grounds to suspect' threshold."
    },
    {
      "title": "The Risk-Based Approach",
      "body": "FINTRAC's risk-based approach (RBA) requires MSBs to calibrate their controls to their specific ML/TF risk exposure rather than applying the same measures to every client or transaction. Risk is assessed across four dimensions: client risk (PEPs, high-risk occupations, corporate structures), product risk (virtual currency, cash-intensive services), delivery channel risk (online-only, agent networks), and geographic risk (countries on FATF's lists, sanctioned jurisdictions). Higher-risk clients and transactions receive enhanced due diligence (EDD); lower-risk relationships receive simplified treatment. The RBA does not permit ignoring risk — it requires documenting why a particular risk level was assigned."
    },
    {
      "title": "Overview of FINTRAC Reporting Obligations",
      "body": "MSBs have five core reporting obligations to FINTRAC: (1) Suspicious Transaction Reports (STRs) — filed within 30 calendar days whenever there are reasonable grounds to suspect ML or TF, regardless of amount. (2) Large Cash Transaction Reports (LCTRs) — for cash receipts of $10,000 or more within 24 hours, filed within 15 calendar days. (3) Electronic Funds Transfer Reports (EFTRs) — for international wires of $10,000 or more, filed within 5 business days. (4) Terrorist Property Reports — immediate filing when holding property belonging to a listed person. (5) Casino Disbursement Reports — not applicable to eFinMoney but part of the broader FINTRAC regime. Each report is submitted via the FINTRAC F2R web portal."
    }
  ]$sm01$::jsonb,
  quiz = $qz01$[
    {
      "question": "What are the three classic stages of money laundering, in order?",
      "options": ["Concealment, structuring, integration", "Placement, layering, integration", "Layering, placement, concealment", "Structuring, placement, layering"],
      "answer": 1
    },
    {
      "question": "How does terrorist financing differ fundamentally from money laundering?",
      "options": ["TF always involves larger amounts", "TF funds can originate from legitimate sources; the criminal element is the intended use", "TF only occurs internationally", "TF requires an offshore bank account"],
      "answer": 1
    },
    {
      "question": "Which Act primarily governs FINTRAC's powers and MSB reporting obligations in Canada?",
      "options": ["The Bank Act", "The Proceeds of Crime (Money Laundering) and Terrorist Financing Act", "The Retail Payment Activities Act", "The PIPEDA Act"],
      "answer": 1
    },
    {
      "question": "What is the maximum Administrative Monetary Penalty FINTRAC can issue per violation?",
      "options": ["$100,000", "$250,000", "$500,000", "$1,000,000"],
      "answer": 2
    },
    {
      "question": "How often must an MSB renew its FINTRAC registration?",
      "options": ["Every 6 months", "Every year", "Every 2 years", "Every 5 years"],
      "answer": 1
    },
    {
      "question": "Which of the following is NOT one of the five mandatory elements of a FINTRAC compliance program?",
      "options": ["A designated compliance officer", "Written policies and procedures", "An annual external audit by a public accountant", "A risk assessment"],
      "answer": 2
    },
    {
      "question": "The 24-hour aggregation rule for LCTRs means:",
      "options": ["You must file within 24 hours of the transaction", "Multiple cash transactions by or on behalf of the same client totalling $10,000+ in 24 hours trigger an LCTR", "Only transactions after midnight count toward the threshold", "All transactions in a single day must be aggregated regardless of client"],
      "answer": 1
    },
    {
      "question": "Which transaction threshold triggers a Large Cash Transaction Report (LCTR)?",
      "options": ["$5,000", "$7,500", "$10,000", "$15,000"],
      "answer": 2
    },
    {
      "question": "An MSB must file a Suspicious Transaction Report within how many calendar days of forming reasonable grounds to suspect?",
      "options": ["5 days", "15 days", "30 days", "60 days"],
      "answer": 2
    },
    {
      "question": "Under the risk-based approach (RBA), what does 'calibrating controls to risk' mean in practice?",
      "options": ["Applying the same controls to all clients equally", "Skipping identification for low-value transactions", "Applying enhanced measures where risk is higher and standard measures where risk is lower", "Delegating all risk decisions to FINTRAC"],
      "answer": 2
    },
    {
      "question": "For how many years must MSBs retain most records under the PCMLTFR?",
      "options": ["2 years", "3 years", "5 years", "7 years"],
      "answer": 2
    },
    {
      "question": "A client making several cash deposits of $9,500 over consecutive days is exhibiting a red flag known as:",
      "options": ["Layering", "Integration", "Structuring (smurfing)", "Third-party placement"],
      "answer": 2
    }
  ]$qz01$::jsonb
WHERE course_name = 'AML/ATF Fundamentals';

-- ---------------------------------------------------------------
-- F-02  PCMLTFA/PCMLTFR Legislative Deep Dive  (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'PCMLTFA/PCMLTFR Legislative Deep Dive',
  'compliance',
  'fintrac_mandatory',
  true, 12, 60, 80,
  'Compliance, Finance, Operations',
  'A detailed walkthrough of the PCMLTFA and PCMLTFR — structure, key definitions, penalty provisions, and 2020 virtual currency amendments.',
  $sm02$[
    {
      "title": "Structure of the PCMLTFA",
      "body": "The Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA) is divided into four main parts. Part 1 establishes reporting and record-keeping obligations for designated reporting entities. Part 2 covers client identification, beneficial ownership, and politically exposed persons. Part 3 creates FINTRAC and defines its mandate, powers, and information-sharing framework. Part 4 contains the penalty and offence provisions, including the Administrative Monetary Penalty schedule. The PCMLTFR (Regulations) operationalise each Part by specifying thresholds, timelines, forms, and procedures. Staff working in compliance should have direct access to the current consolidated text of both the Act and Regulations at laws-lois.justice.gc.ca."
    },
    {
      "title": "Who Is a Reporting Entity?",
      "body": "The PCMLTFA applies to specific 'reporting entities' listed in s.5, including: financial entities (banks, credit unions), securities dealers, life insurance companies, real estate brokers, casinos, accountants in certain situations, dealers in precious metals and stones, and Money Services Businesses (MSBs). MSBs are defined by their activities: foreign exchange, funds transfer, virtual currency exchange, money orders, traveller's cheques, and crowdfunding platforms. Each category has activity-specific obligations under the PCMLTFR — the obligations of an MSB differ from those of a real estate broker. eFinMoney is an MSB and all staff should be familiar with MSB-specific obligations."
    },
    {
      "title": "Key Definitions in the PCMLTFA",
      "body": "Critical defined terms include: 'Client' — any person or entity that engages in a financial transaction with the MSB. 'Business relationship' — established after three or more transactions in a five-year period or at account opening. 'Virtual currency' — a digital representation of value that can be exchanged for money; this includes Bitcoin, USDT, and similar assets. 'Politically exposed foreign person (PEFP)' — a person who holds or has held a senior public role in a foreign state. 'Politically exposed domestic person (PEDP)' — equivalent but for Canadian offices. 'Head of an international organisation (HIO)' — the head of an international body such as the UN or World Bank. Knowing these definitions precisely is essential because the obligations attached to each category are distinct."
    },
    {
      "title": "Beneficial Ownership — The 25% Rule",
      "body": "PCMLTFR amendments effective June 2021 expanded beneficial ownership obligations. A 'beneficial owner' is any individual who directly or indirectly owns or controls 25% or more of a corporation or entity. MSBs must collect beneficial ownership information when establishing a business relationship with a corporation, partnership, or trust. For corporations: identify all individuals owning or controlling 25%+. For trusts: identify all trustees and beneficiaries. For partnerships: identify all partners. Verification must occur within 30 days of relationship establishment. Records of beneficial ownership must be kept for 5 years. Where ownership is layered through multiple corporations, you must look through the layers to identify the ultimate human owner."
    },
    {
      "title": "Virtual Currency Obligations — 2020 Amendments",
      "body": "The June 2020 PCMLTFR amendments brought virtual currency (VC) dealers fully within the MSB framework. Key new obligations: (1) Large Virtual Currency Transaction Reports (LVCTR) — file a report when receiving VC equivalent to CAD $10,000 or more in a single transaction or within 24 hours. Filing deadline is 15 calendar days. (2) Travel Rule for VC — for VC transfers at or above $1,000, transmit originator information (name, address, wallet address) to the receiving institution. (3) VC record keeping — same 5-year retention applies. These rules close the gap that previously allowed VC to be used for ML/TF without triggering traditional cash reporting. eFinMoney must apply these rules to any crypto payment corridors."
    },
    {
      "title": "Penalty Provisions — Part 4 of the PCMLTFA",
      "body": "Part 4 of the PCMLTFA contains the enforcement framework. Section 73.1 empowers FINTRAC to issue Administrative Monetary Penalties (AMPs) for violations. The penalty schedule classifies violations as minor (up to $1,000), serious (up to $100,000), or very serious (up to $500,000) per violation. Each distinct failure to file a required report, or each instance of missing client identification, is a separate violation — penalties can compound quickly. In addition to AMPs, s.74 creates criminal offences: knowingly failing to report, tipping off a client that an STR was filed, or structuring transactions to avoid thresholds can result in up to 5 years imprisonment."
    },
    {
      "title": "The PCMLTFR — Part-by-Part Overview",
      "body": "The PCMLTFR is divided into Parts that mirror the PCMLTFA structure: Part 1 — General compliance program requirements (5 elements, review timelines). Part 2 — Client identification: methods, thresholds, when to verify, what records to keep. Part 3 — Record-keeping: specific records each entity type must maintain, retention period (5 years), format requirements. Part 4 — Reporting: transaction thresholds and deadlines for each report type. Part 5 — Ministerial directives. Schedule 1 — Lists the AMP amounts per violation category. The PCMLTFR is amended more frequently than the PCMLTFA; MSBs should subscribe to the Canada Gazette to be notified of Regulatory Impact Analysis Statements for upcoming changes."
    },
    {
      "title": "Recent Amendments and Staying Current",
      "body": "The PCMLTFR has been materially amended several times: 2016 — added dealer in precious metals/stones obligations. 2019 — updated MSB registration rules and added crowdfunding platforms. 2020 — added virtual currency obligations (LVCTR, VC travel rule, VC record keeping). 2021 — expanded beneficial ownership requirements to 25% threshold. 2024 — strengthened foreign PEP rules and updated the AMP schedule. MSBs must update their compliance policies and training whenever regulations change. The compliance effectiveness review (conducted every two years) is the formal mechanism to assess whether the program reflects current law, but regulatory awareness must be continuous — waiting for the biennial review to act on a new obligation would itself be non-compliant."
    }
  ]$sm02$::jsonb,
  $qz02$[
    {
      "question": "Under the PCMLTFA, a 'business relationship' with a client is established after how many transactions within a five-year period?",
      "options": ["One", "Two", "Three or more", "Five or more"],
      "answer": 2
    },
    {
      "question": "The 25% beneficial ownership threshold means:",
      "options": ["25% of transactions must be verified", "Any individual owning or controlling 25% or more of an entity must be identified", "The pass mark for compliance training is 25%", "25% of staff must be trained annually"],
      "answer": 1
    },
    {
      "question": "Which Part of the PCMLTFA contains the Administrative Monetary Penalty provisions?",
      "options": ["Part 1", "Part 2", "Part 3", "Part 4"],
      "answer": 3
    },
    {
      "question": "A Large Virtual Currency Transaction Report (LVCTR) is required when receiving virtual currency worth at least:",
      "options": ["$1,000 CAD equivalent", "$3,000 CAD equivalent", "$10,000 CAD equivalent", "$25,000 CAD equivalent"],
      "answer": 2
    },
    {
      "question": "Criminal prosecution for knowingly failing to file a required FINTRAC report can result in imprisonment of up to:",
      "options": ["1 year", "2 years", "5 years", "10 years"],
      "answer": 2
    },
    {
      "question": "The PCMLTFR Part 3 primarily covers:",
      "options": ["Compliance program requirements", "Client identification", "Record keeping", "Reporting thresholds and deadlines"],
      "answer": 2
    },
    {
      "question": "Virtual currency Travel Rule obligations are triggered at transfers at or above:",
      "options": ["$500", "$1,000", "$3,000", "$10,000"],
      "answer": 1
    },
    {
      "question": "The 2020 PCMLTFR amendments primarily addressed:",
      "options": ["Precious metals dealers", "Virtual currency obligations", "Real estate reporting", "Casino regulations"],
      "answer": 1
    },
    {
      "question": "Beneficial ownership records must be kept for:",
      "options": ["2 years", "3 years", "5 years", "7 years"],
      "answer": 2
    },
    {
      "question": "Which of the following is a defined MSB activity under the PCMLTFA?",
      "options": ["Selling life insurance", "Dealing in virtual currency", "Providing mortgage advice", "Operating a securities account"],
      "answer": 1
    },
    {
      "question": "The maximum AMP for a 'very serious' violation under the PCMLTFA penalty schedule is:",
      "options": ["$100,000", "$250,000", "$500,000", "$1,000,000"],
      "answer": 2
    },
    {
      "question": "When must beneficial ownership information be verified after establishing a business relationship?",
      "options": ["Immediately at account opening", "Within 30 days", "Within 6 months", "At the annual review"],
      "answer": 1
    }
  ]$qz02$::jsonb,
  $res02$[
    {"label": "PCMLTFA — Full Text (Justice Canada)", "url": "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/FullText.html", "type": "Statute"},
    {"label": "PCMLTFR — Full Text (Justice Canada)", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"},
    {"label": "FINTRAC — Methods to Report", "url": "https://www.fintrac-canafe.gc.ca/reporting-declaration/1-eng", "type": "Official Guidance"},
    {"label": "FINTRAC Compliance Program Guide (Guide 4)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng", "type": "Official Guidance"},
    {"label": "FINTRAC AMP Policy", "url": "https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/ampo-pasgr/ampo-pasgr-eng", "type": "Official Guidance"}
  ]$res02$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-03  Suspicious Transaction Reporting  (UPDATE)
-- ---------------------------------------------------------------
UPDATE public.training_courses SET
  estimated_minutes = 60,
  pass_mark         = 80,
  is_mandatory      = true,
  frequency_months  = 12,
  study_materials = $sm03$[
    {
      "title": "What Makes a Transaction 'Suspicious'?",
      "body": "A Suspicious Transaction Report (STR) is required whenever a reporting entity has reasonable grounds to suspect that a transaction (completed, proposed, or attempted) is related to the commission or attempted commission of a money laundering or terrorist financing offence. The key phrase is 'reasonable grounds to suspect' — this is a lower standard than balance of probabilities or beyond reasonable doubt. You do not need to be certain; you need an objectively reasonable basis for suspicion. The suspicion can arise from the transaction itself, the client's behaviour, the context, or the combination. Even a transaction that did not occur (a proposed or attempted one) must be reported if you formed reasonable grounds to suspect."
    },
    {
      "title": "STR vs LCTR vs EFTR — Key Differences",
      "body": "STRs, LCTRs, and EFTRs are three distinct and independent reporting obligations. An LCTR is threshold-based: cash of $10,000 or more triggers it automatically, regardless of suspicion. An EFTR is similarly threshold-based: international electronic transfers of $10,000 or more. An STR is suspicion-based: there is no minimum dollar amount — you must file an STR on a $200 transaction if you have reasonable grounds to suspect ML/TF. An STR and an LCTR can both be required for the same transaction. An STR for a large cash transaction does not eliminate the obligation to also file an LCTR. The reporting obligations are cumulative, not alternatives."
    },
    {
      "title": "The 'Reasonable Grounds to Suspect' Standard",
      "body": "FINTRAC guidance clarifies that 'reasonable grounds to suspect' sits between mere suspicion (a gut feeling with no articulable basis) and balance of probabilities (more likely than not). It requires: (1) an objective basis — something you can point to and articulate, not just instinct; and (2) that basis must lead a reasonable person to suspect ML/TF. The standard is lower than what is needed for an arrest or legal action, which makes sense — STRs are intelligence-gathering tools, not criminal accusations. Factors that contribute to reasonable grounds include the client's transaction history, inconsistency between stated purpose and actual behaviour, red flags from FINTRAC's published indicator lists, and the broader context of the transaction."
    },
    {
      "title": "ML/TF Indicators That Trigger STRs",
      "body": "FINTRAC publishes indicator lists specific to MSBs. Key ML indicators for eFinMoney include: a client conducting multiple transactions just below $10,000 in amounts (structuring); a client who is reluctant to provide identification or changes ID during the relationship; a client whose transaction pattern is inconsistent with their stated occupation or business; transactions where the economic rationale is unclear or the client cannot explain the purpose; sending funds to high-risk jurisdictions with no plausible personal or business connection; third parties instructing or funding on behalf of clients; and sudden large transactions inconsistent with the client's prior activity. Any combination of these factors should trigger a formal suspicion assessment."
    },
    {
      "title": "The Tipping-Off Prohibition — s.8 PCMLTFA",
      "body": "Section 8 of the PCMLTFA prohibits 'tipping off': once you have filed or decided to file an STR, you must not disclose to the client, or any person associated with the client, that an STR has been or will be filed. The prohibition also covers disclosing that FINTRAC has requested information. This protection is essential to the integrity of financial intelligence — if suspects know an STR is being filed, they can flee, destroy evidence, or change their behaviour. Violating the tipping-off prohibition is itself a criminal offence under s.8(1). Staff must not discuss STR filings even casually. The STR submission, the decision to file, and all supporting documentation should be kept confidential within the compliance function."
    },
    {
      "title": "The 30-Day Filing Deadline",
      "body": "An STR must be submitted to FINTRAC within 30 calendar days of the day on which the reporting entity first forms reasonable grounds to suspect. The clock starts when reasonable grounds arise, not when the transaction occurred (which could be earlier) and not after deliberation ends. If you form reasonable grounds on Day 1, you have until Day 30 to submit — but delay without cause is itself a compliance risk. Where there is uncertainty about whether the grounds exist, document your analysis as it develops; FINTRAC may review the timeline during an examination. For imminent threats (e.g., terrorist property), file immediately and also submit a Terrorist Property Report, which has no delay grace period."
    },
    {
      "title": "Completing the STR — Required Information",
      "body": "The STR form in F2R requires: (1) Transaction details — date, type, amount, currency, direction (sent/received). (2) Client information — name, address, date of birth, occupation, type of ID provided. (3) Third-party information — if someone else instructed or funded the transaction. (4) The ML/TF indicator(s) that triggered the suspicion — select from FINTRAC's list and describe in the narrative box. (5) The narrative — a clear, factual description of why you suspected ML/TF, what the client said, what you observed, and any other context. The narrative is the most important section: FINTRAC analysts use it to assess whether to open a disclosure package to law enforcement. Vague narratives reduce the intelligence value of the report."
    },
    {
      "title": "Filing Through the F2R Portal",
      "body": "All STRs (and other FINTRAC reports) are submitted through the FINTRAC F2R (FINTRAC to Reporting Entities) web portal at www6.fintrac-canafe.gc.ca. The portal requires the reporting entity's FINTRAC registration credentials. Key features: reports can be saved as drafts; a confirmation number is issued on successful submission; batch reporting is available for LCTRs. STRs cannot be 'unsent' after submission, but corrections can be submitted as amended STRs referencing the original confirmation number. The compliance officer should retain a copy of every submitted STR (the confirmation number and the data entered) for 5 years. Access to the F2R portal should be restricted to compliance-authorised staff."
    },
    {
      "title": "Safe Harbour for Good-Faith STR Filing",
      "body": "MSBs and their staff are explicitly protected from civil and criminal liability for filing an STR in good faith under s.10.1 of the PCMLTFA. This means that even if the client is ultimately found innocent, the act of filing an STR — when done on an objectively reasonable basis — cannot form the basis of a defamation claim, a breach of confidentiality claim, or any other civil action against the MSB or the individual who made the report. This protection exists to encourage robust reporting without fear of legal retaliation from clients. However, the protection only applies to good-faith reports; fabricating suspicious activity or filing an STR for a personal vendetta would not attract the protection."
    },
    {
      "title": "Case Study — When to File",
      "body": "Scenario: A client sends $4,000 to Nigeria three times in one week, each time using a different sender name but the same phone number and email address. The client says it is for 'family support' but cannot name the family members or explain the different sender names. Analysis: Multiple red flags are present — inconsistent identity information, structured amounts, and an implausible explanation. The 24-hour aggregation rule is also relevant: if any two of those transactions occurred within 24 hours of each other, they aggregate to $8,000 — still below the LCTR threshold but highly suspicious in combination. Reasonable grounds to suspect ML exist. File an STR within 30 days. Document all communications with the client and the basis for the decision."
    }
  ]$sm03$::jsonb,
  quiz = $qz03$[
    {
      "question": "An STR must be filed within how many calendar days of forming reasonable grounds to suspect?",
      "options": ["5 business days", "15 calendar days", "30 calendar days", "60 calendar days"],
      "answer": 2
    },
    {
      "question": "The legal standard for filing an STR is:",
      "options": ["Beyond reasonable doubt", "Balance of probabilities (more likely than not)", "Reasonable grounds to suspect", "Absolute certainty"],
      "answer": 2
    },
    {
      "question": "The tipping-off prohibition under s.8 PCMLTFA means:",
      "options": ["You must inform the client an STR was filed", "You cannot disclose to the client that an STR has been or will be filed", "You must notify the police before filing", "You must share the STR with your bank"],
      "answer": 1
    },
    {
      "question": "Can an STR be filed for a transaction that did not actually occur?",
      "options": ["No — only completed transactions qualify", "Yes — proposed or attempted transactions also qualify", "Only if the amount would have exceeded $10,000", "Only for virtual currency transactions"],
      "answer": 1
    },
    {
      "question": "Which system is used to submit STRs to FINTRAC?",
      "options": ["SWIFT", "Canada Revenue Agency portal", "F2R (FINTRAC web reporting portal)", "OSFI Connect"],
      "answer": 2
    },
    {
      "question": "An STR and an LCTR can both be required for the same transaction. True or false?",
      "options": ["False — filing an LCTR removes the STR obligation", "False — filing an STR removes the LCTR obligation", "True — the obligations are cumulative, not alternatives", "True — but only for amounts over $25,000"],
      "answer": 2
    },
    {
      "question": "Which of the following BEST illustrates a structuring red flag?",
      "options": ["A client sending $20,000 in a single wire with a clear invoice", "A client making three $9,000 cash transactions on consecutive days to the same destination", "A client providing a government-issued ID for a $500 transaction", "A client asking for a receipt"],
      "answer": 1
    },
    {
      "question": "MSBs are protected from civil and criminal liability for good-faith STR filings under which section of the PCMLTFA?",
      "options": ["s.5", "s.8", "s.10.1", "s.54"],
      "answer": 2
    },
    {
      "question": "When does the 30-day STR filing clock begin?",
      "options": ["When the transaction was completed", "When the client next contacts you", "When you first form reasonable grounds to suspect", "When FINTRAC sends an information request"],
      "answer": 2
    },
    {
      "question": "Why is the narrative section of an STR critically important?",
      "options": ["It is used to calculate the AMP", "FINTRAC analysts use it to assess whether to open a law-enforcement disclosure", "It is shared with the client automatically", "It determines the 30-day deadline"],
      "answer": 1
    },
    {
      "question": "Violating the tipping-off prohibition is:",
      "options": ["A minor administrative matter", "A criminal offence under s.8(1) of the PCMLTFA", "Only relevant if the client complains", "Permissible if the client requests confirmation"],
      "answer": 1
    },
    {
      "question": "Access to the F2R portal to submit STRs should be:",
      "options": ["Open to all staff", "Restricted to compliance-authorised staff", "Managed by the IT department only", "Shared with the client-facing team for efficiency"],
      "answer": 1
    },
    {
      "question": "A client who uses three different sender names but the same phone number across weekly transactions is exhibiting a red flag related to:",
      "options": ["Normal remittance behaviour", "Inconsistent identity information — a key ML indicator", "Efficient use of the service", "The travel rule"],
      "answer": 1
    }
  ]$qz03$::jsonb
WHERE course_name = 'Suspicious Transaction Reporting';

-- ---------------------------------------------------------------
-- F-04  Large Cash Transaction & EFT Reporting  (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Large Cash Transaction & EFT Reporting',
  'compliance',
  'fintrac_mandatory',
  true, 12, 45, 80,
  'All staff',
  'Thresholds, timelines, and procedures for filing Large Cash Transaction Reports (LCTRs) and Electronic Funds Transfer Reports (EFTRs) with FINTRAC.',
  $sm04$[
    {
      "title": "The Large Cash Transaction Report (LCTR)",
      "body": "An MSB must file an LCTR whenever it receives cash of $10,000 or more — in Canadian dollars or the equivalent in a foreign currency — in a single transaction or in two or more transactions that together total $10,000 or more within a consecutive 24-hour period from or on behalf of the same person. 'Cash' includes coins, banknotes, and money orders or similar instruments, but does NOT include cheques or electronic transfers. The filing deadline is 15 calendar days from the date the cash was received. The LCTR is mandatory regardless of the client's explanation or the MSB's own assessment of risk — it is a threshold-triggered obligation, not a discretionary one."
    },
    {
      "title": "The 24-Hour Aggregation Rule",
      "body": "The 24-hour rule aggregates cash transactions conducted by, or on behalf of, the same person within any consecutive 24-hour window. If a client deposits $6,000 at 10 a.m. and returns at 3 p.m. to deposit another $5,000, the combined total of $11,000 within 24 hours triggers an LCTR — even though neither transaction individually reached $10,000. The rule counts transactions 'on behalf of' the client as well: if a third party brings cash on a client's behalf and the totals aggregate to $10,000+, the reporting entity must file. Structuring transactions specifically to avoid this threshold is itself a criminal offence under s.9(1) of the PCMLTFA and a strong ML indicator."
    },
    {
      "title": "Exemptions from LCTR Filing",
      "body": "Not all $10,000+ cash transactions trigger an LCTR. The PCMLTFR provides exemptions for certain entities whose cash transactions are inherently high-volume and low-risk: federally and provincially regulated financial institutions, public bodies (governments and their agents), and entities with a pre-existing exemption under the Regulations. The exemption applies to cash received FROM these entities, not cash received from their customers. For MSBs like eFinMoney, the practical exemption situations are rare — the exemption would apply if, for example, the Bank of Canada delivered cash to a currency exchange operation. When in doubt, file the LCTR; filing an unnecessary LCTR carries no penalty, while failing to file a required one does."
    },
    {
      "title": "The Electronic Funds Transfer Report (EFTR)",
      "body": "An EFTR is required when an MSB initiates or receives an international electronic funds transfer (EFT) of $10,000 or more. 'International' means the transfer crosses a border — a wire from Canada to Nigeria, for example. Domestic transfers between Canadian accounts are not covered. The 24-hour aggregation rule also applies to EFTs: multiple international wires to or from the same person within 24 hours that total $10,000+ trigger an EFTR. The filing deadline for EFTRs is 5 business days from the date the transfer was initiated or received — shorter than the 15-calendar-day LCTR deadline. Note the difference: LCTR is calendar days, EFTR is business days."
    },
    {
      "title": "Information Required on LCTRs and EFTRs",
      "body": "Both reports require: (1) Transaction details — date, amount, currency, type (cash/EFT). (2) Client identification — full name, address, date of birth, occupation, type and number of government-issued ID. (3) Third-party information — if someone else conducted the transaction on behalf of the client, their name, address, and relationship to the client must be recorded. (4) Account information — if applicable. (5) For EFTRs: the receiving or sending account details, financial institution name, SWIFT code or routing number, and beneficiary/originator information. Incomplete reports are a compliance deficiency. FINTRAC's F2R portal validates mandatory fields before accepting submission."
    },
    {
      "title": "Submitting LCTRs and EFTRs via F2R",
      "body": "Both LCTRs and EFTRs are submitted through the FINTRAC F2R web portal. The portal allows: individual report submission, batch upload via an XML template (useful for high-volume MSBs), draft saving, and amendment of previously submitted reports. Each submitted report generates a FINTRAC confirmation number that must be retained in the MSB's records for 5 years alongside the supporting transaction data. Batch XML submission is useful if eFinMoney's transaction volume results in multiple LCTRs or EFTRs per month. The XML schema is published by FINTRAC and can be integrated into transaction-processing systems to auto-populate reports."
    },
    {
      "title": "Common Errors and How to Avoid Them",
      "body": "The most common LCTR/EFTR errors found in FINTRAC examinations: (1) Missing third-party information — failing to identify who actually conducted the transaction when it was done on behalf of another person. (2) Late filing — exceeding the 15-day (LCTR) or 5-business-day (EFTR) deadline. (3) Incorrect currency conversion — when cash is received in a foreign currency, convert to CAD using the rate on the date of transaction, not the filing date. (4) Failing to aggregate — not applying the 24-hour rule and thereby failing to identify aggregated transactions that cross the $10,000 threshold. (5) Filing an STR but not the LCTR — the two obligations are independent; suspicion does not replace the threshold-triggered filing requirement."
    }
  ]$sm04$::jsonb,
  $qz04$[
    {
      "question": "What is the threshold that triggers a Large Cash Transaction Report (LCTR)?",
      "options": ["$5,000 in cash", "$7,500 in any currency", "$10,000 in cash or equivalent", "$15,000 in any transaction"],
      "answer": 2
    },
    {
      "question": "An LCTR must be filed within how many calendar days?",
      "options": ["5 calendar days", "10 calendar days", "15 calendar days", "30 calendar days"],
      "answer": 2
    },
    {
      "question": "An EFTR must be filed within how many business days?",
      "options": ["1 business day", "3 business days", "5 business days", "15 business days"],
      "answer": 2
    },
    {
      "question": "The 24-hour aggregation rule for LCTRs means:",
      "options": ["You must file within 24 hours of any cash transaction", "Multiple cash transactions by or on behalf of the same client totalling $10,000+ within 24 hours require an LCTR", "Any transaction after midnight starts a new day", "Only one transaction per 24 hours can be aggregated"],
      "answer": 1
    },
    {
      "question": "EFTRs are required for:",
      "options": ["All electronic transfers regardless of amount", "Domestic transfers within Canada above $10,000", "International electronic funds transfers at or above $10,000", "Cash deposits of $10,000 or more"],
      "answer": 2
    },
    {
      "question": "Which of the following is exempt from LCTR filing?",
      "options": ["A private corporation client", "An individual MSB customer", "A federally regulated financial institution", "A registered charity"],
      "answer": 2
    },
    {
      "question": "A client deposits $6,000 at 9 a.m. and $5,000 at 2 p.m. on the same day. What is required?",
      "options": ["No action — each transaction is below $10,000", "File an STR only", "File an LCTR for the aggregated $11,000", "File two separate LCTRs"],
      "answer": 2
    },
    {
      "question": "When a cash transaction is received in a foreign currency, what exchange rate should be used for LCTR purposes?",
      "options": ["The rate on the filing date", "The rate on the date of the transaction", "The Bank of Canada monthly average", "Any rate disclosed to the client"],
      "answer": 1
    },
    {
      "question": "Filing an STR for a suspicious $10,000+ cash transaction:",
      "options": ["Replaces the LCTR obligation", "Does not eliminate the separate obligation to file an LCTR", "Only requires an LCTR if the STR is accepted by FINTRAC", "Requires FINTRAC approval before filing the LCTR"],
      "answer": 1
    },
    {
      "question": "Which system is used to submit both LCTRs and EFTRs to FINTRAC?",
      "options": ["SWIFT", "Canada Revenue Agency portal", "OSFI Connect", "FINTRAC F2R web portal"],
      "answer": 3
    }
  ]$qz04$::jsonb,
  $res04$[
    {"label": "FINTRAC — Large Cash Transaction Reporting Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/lctr-rtd/lctr-rtd-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Electronic Funds Transfer Reporting Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/eftr-dofe/eftr-dofe-eng", "type": "Official Guidance"},
    {"label": "F2R Web Reporting Portal", "url": "https://www6.fintrac-canafe.gc.ca/f2r/public/fintrac-web-reporting-f2r/user-agreement/", "type": "Portal"},
    {"label": "PCMLTFR — Reporting Requirements", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"}
  ]$res04$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-05  Travel Rule & Correspondent Banking  (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Travel Rule & Correspondent Banking',
  'compliance',
  'fintrac_mandatory',
  true, 12, 45, 80,
  'Operations, Compliance',
  'Canada''s implementation of the FATF Travel Rule for wire transfers and virtual currency — what to transmit, receive, and record at the $1,000 threshold.',
  $sm05$[
    {
      "title": "What Is the Travel Rule?",
      "body": "The Travel Rule — named after FATF Recommendation 16 — requires financial institutions and MSBs to collect, verify, and transmit information about the originator and beneficiary of electronic fund transfers (EFTs) and virtual currency (VC) transfers. Canada implemented the Travel Rule in the PCMLTFR (ss.66.1–66.4 and VC equivalents). The purpose is to ensure that transaction information 'travels' with the funds, making it harder for criminals to launder money through wire transfers. Without the Travel Rule, a $1 million wire from a criminal could arrive at its destination with no sender information, making tracing impossible. The threshold in Canada is $1,000 CAD (or equivalent in foreign currency or virtual currency)."
    },
    {
      "title": "Outgoing Transfers — What to Transmit",
      "body": "For outgoing EFTs at or above $1,000, the sending MSB must transmit to the next intermediary or receiving institution: the originator's full name, address (or date of birth in specific circumstances), and account number (or unique transaction reference number). This information must travel in the payment message itself or in a linked, accessible message. It cannot be sent separately after the fact. For batch payments, each individual payment within the batch must carry the required originator information. Failure to transmit means the receiving institution may not be able to meet its own obligations and may return or delay the transfer — and FINTRAC can cite the sending MSB for non-compliance."
    },
    {
      "title": "Incoming Transfers — Missing Information Procedures",
      "body": "When an MSB receives an incoming EFT that is missing required originator or beneficiary information, the PCMLTFR requires the MSB to take 'reasonable measures' to obtain the missing information from the ordering institution. 'Reasonable measures' include contacting the sending institution directly to request the missing data. If the missing information cannot be obtained, the MSB must decide whether to execute, reject, or suspend the transfer. A pattern of incoming transfers with consistently missing information from the same ordering institution is itself an STR indicator — it suggests the sender is deliberately stripping information."
    },
    {
      "title": "Virtual Currency Travel Rule",
      "body": "Following the 2020 PCMLTFR amendments, the Travel Rule applies equally to virtual currency transfers at or above $1,000 CAD equivalent. For VC transfers: the 'account number' equivalent is the wallet address. The sending entity must transmit the originator's name, address or date of birth, and wallet address to the receiving VC entity. The receiving entity must collect and retain this information. This is more technically complex than wire transfers because blockchain transactions are pseudonymous by default. Travel Rule compliance for VC requires either a Trusted Third Party solution (TRP, Sygna, TRUST, or similar), direct counterparty communication, or bilateral data-sharing agreements between VC service providers."
    },
    {
      "title": "Correspondent Banking Relationships",
      "body": "A 'correspondent relationship' occurs when one financial institution (the respondent) uses the services of another (the correspondent) to conduct cross-border transfers on its behalf. For MSBs routing international remittances through banking partners, this relationship is central. The PCMLTFR requires that MSBs conduct enhanced due diligence on correspondent institutions: obtain information about the correspondent's AML/ATF program, confirm it is regulated and subject to equivalent standards, and assess its ML/TF risk. Maintaining a correspondent relationship with an institution that does not have adequate AML/ATF controls — or that is in a high-risk jurisdiction — exposes eFinMoney to significant regulatory and reputational risk."
    },
    {
      "title": "Record-Keeping for Transfers",
      "body": "For every EFT and VC transfer, the MSB must keep a record that includes: the name and address of the originator, the originator's account number or unique transaction reference, the name and address of the beneficiary, the date and amount of the transfer, and the name of the correspondent institution (if applicable). These records must be retained for 5 years from the date they were created. For incoming transfers, the MSB must also keep a record of what information was received and, if information was missing, the steps taken to obtain it. The records must be retrievable for FINTRAC examination."
    },
    {
      "title": "Consequences of Non-Compliance",
      "body": "Failure to comply with the Travel Rule — whether on outgoing or incoming transfers — is a violation of the PCMLTFR and subject to AMPs. Common violations include: transmitting incomplete originator information on outgoing wires; failing to document the steps taken to obtain missing information on incoming wires; failing to apply Travel Rule obligations to VC transfers; and not maintaining adequate records. FINTRAC's examination process reviews a sample of wire transfer and VC records against Travel Rule requirements. Non-compliant transfers are counted individually, meaning that 50 wires with missing originator information could represent 50 separate violations."
    }
  ]$sm05$::jsonb,
  $qz05$[
    {
      "question": "Canada's Travel Rule applies to electronic funds transfers at or above:",
      "options": ["$500 CAD", "$1,000 CAD", "$3,000 CAD", "$10,000 CAD"],
      "answer": 1
    },
    {
      "question": "For outgoing wire transfers, which information must be transmitted under the Travel Rule?",
      "options": ["Only the amount and currency", "The originator's name, address (or date of birth), and account number", "The compliance officer's name", "The FINTRAC confirmation number"],
      "answer": 1
    },
    {
      "question": "Canada's Travel Rule is implemented through which regulation?",
      "options": ["The Bank Act Schedule I", "PCMLTFR ss.66.1–66.4", "FINTRAC Guide 4", "The RPAA"],
      "answer": 1
    },
    {
      "question": "When receiving an incoming wire with missing originator information, you must:",
      "options": ["Reject the transfer immediately", "Take reasonable measures to obtain the missing information from the sending institution", "File an LCTR", "Accept the transfer and make a note in the file"],
      "answer": 1
    },
    {
      "question": "The Travel Rule for virtual currency transfers is triggered at or above:",
      "options": ["$500 CAD equivalent", "$1,000 CAD equivalent", "$3,000 CAD equivalent", "$10,000 CAD equivalent"],
      "answer": 1
    },
    {
      "question": "For virtual currency transfers, the 'account number' equivalent required under the Travel Rule is:",
      "options": ["The client's SIN", "The wallet address", "The exchange platform's registration number", "The blockchain transaction hash"],
      "answer": 1
    },
    {
      "question": "Wire transfer and VC transfer records must be retained for:",
      "options": ["2 years", "3 years", "5 years", "7 years"],
      "answer": 2
    },
    {
      "question": "A pattern of incoming transfers consistently missing originator information from the same institution is:",
      "options": ["Normal for high-volume corridors", "An STR indicator suggesting deliberate information stripping", "Acceptable if the amounts are under $10,000", "Permissible under the Travel Rule exemptions"],
      "answer": 1
    },
    {
      "question": "The Travel Rule originates from which FATF Recommendation?",
      "options": ["Recommendation 1", "Recommendation 10", "Recommendation 16", "Recommendation 24"],
      "answer": 2
    },
    {
      "question": "Conducting due diligence on a correspondent bank's AML/ATF program is required because:",
      "options": ["It is required by the Bank Act", "Using an institution with inadequate AML controls exposes your MSB to regulatory and reputational risk", "FINTRAC requires all correspondent banks to be pre-approved", "It is only required for institutions in FATF-listed countries"],
      "answer": 1
    }
  ]$qz05$::jsonb,
  $res05$[
    {"label": "FINTRAC — Travel Rule Guidance for EFTs", "url": "https://fintrac-canafe.gc.ca/guidance-directives/transaction-operation/travel-acheminement/1-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — MSB Record Keeping Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/recordkeeping-document/record/msb-eng", "type": "Official Guidance"},
    {"label": "PCMLTFR — Full Text (Justice Canada)", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"}
  ]$res05$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-06  Customer Due Diligence & Enhanced Due Diligence (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Customer Due Diligence & Enhanced Due Diligence',
  'compliance',
  'fintrac_mandatory',
  true, 12, 60, 80,
  'All staff',
  'Identity verification thresholds, acceptable ID methods, PEP obligations (5-year look-back), beneficial ownership (25%), and ongoing monitoring.',
  $sm06$[
    {
      "title": "When Must an MSB Verify Identity?",
      "body": "Under the PCMLTFR, an MSB must verify the identity of a client before, or as soon as practicable after, specific triggering transactions. Key triggers for MSBs: (1) Foreign exchange transactions at or above $3,000. (2) Remittances (money transfers) at or above $1,000 — or any amount when a business relationship exists. (3) Issuing or redeeming money orders at or above $3,000. (4) Virtual currency transactions at or above $1,000. (5) Any transaction where you suspect ML/TF. Identity verification is required at the time of the first transaction that meets a threshold — not just when a formal 'account' is opened. For remittances, the $1,000 threshold is lower than for foreign exchange."
    },
    {
      "title": "Acceptable Identity Verification Methods",
      "body": "The PCMLTFR specifies acceptable methods for verifying an individual's identity. The most common: (1) Government-issued photo identification — a single document that shows the client's name, date of birth, photograph, and unique ID number (e.g., passport, driver's licence). The document must be valid (not expired) and authentic. (2) Dual-process method — if no single-document photo ID is available, use two independent, reliable sources: one confirming name and address (e.g., utility bill), and one confirming name and date of birth (e.g., bank statement). For entities (corporations, partnerships), different rules apply: certificates of incorporation, articles of association, or similar official documents are required in addition to beneficial ownership information."
    },
    {
      "title": "Politically Exposed Persons (PEPs) — Who They Are",
      "body": "A PEP is a person who holds or has held within the past 5 years one of the following senior roles: (1) Politically Exposed Foreign Person (PEFP) — head of state, head of government, senior official in the executive/legislative/judicial branch, senior military official, or senior executive of a state-owned enterprise of a foreign country. (2) Politically Exposed Domestic Person (PEDP) — the Canadian equivalent: Governor General, Prime Minister, federal/provincial minister, member of Parliament, senior judge, etc. (3) Head of an International Organisation (HIO) — the leader of an international body such as the UN, NATO, or World Bank. Family members and close associates of PEPs are also subject to enhanced measures under the Regulations."
    },
    {
      "title": "The 5-Year PEP Look-Back",
      "body": "A critical feature of PEP rules is the 5-year look-back: a person qualifies as a PEP not only if they currently hold a qualifying position, but also if they held one within the past 5 years. This means MSBs cannot simply ask 'are you currently a PEP?' — they must screen against lists of current and recent office-holders, and they must re-screen existing clients periodically. For domestic PEPs and HIOs, enhanced measures are required if the ML/TF risk is assessed as high; for foreign PEPs, enhanced measures are automatically required regardless of assessed risk. The 5-year look-back also applies when screening for PEPs who have left office — an ex-prime minister who left office 3 years ago still qualifies."
    },
    {
      "title": "Enhanced Due Diligence for PEPs",
      "body": "When a client is identified as a PEP (foreign), the PCMLTFR requires automatic enhanced due diligence: (1) Obtain senior management approval before establishing or continuing the business relationship. (2) Take reasonable measures to establish the source of funds and source of wealth. (3) Conduct enhanced ongoing monitoring of the business relationship. For domestic PEPs and HIOs, the enhanced measures apply only if the risk is assessed as high. These measures exist because PEPs have access to public funds and power, making them higher-risk for corruption and bribery-related money laundering. Senior management approval — not just compliance officer sign-off — is a mandatory procedural step that must be documented."
    },
    {
      "title": "Third-Party Determination",
      "body": "A 'third party' is the person on whose behalf a transaction is being conducted, as opposed to the person physically present. MSBs must determine whether a third party is involved whenever a client conducts a transaction. If the client indicates someone else is instructing or funding the transaction, the MSB must collect the third party's name, address, and relationship to the client. If the MSB has reasonable grounds to suspect a third party is involved but the client denies it, the MSB must still make the third-party determination and record it. Third-party involvement is a significant ML risk factor — it often indicates the actual beneficiary is trying to conceal their role."
    },
    {
      "title": "Beneficial Ownership — Corporations and Trusts",
      "body": "When establishing a business relationship with a corporation, partnership, or trust, the MSB must identify beneficial owners — individuals who own or control 25% or more. For corporations: identify all shareholders at or above the 25% threshold; if a corporation is itself a shareholder, look through to the ultimate human owner. For trusts: identify all trustees, settlors (if they retain interest), and beneficiaries. For partnerships: identify all partners. Beneficial ownership records — name, address, and ownership/control percentage — must be collected and kept for 5 years. Verification of beneficial ownership must occur within 30 days of the relationship being established."
    },
    {
      "title": "Ongoing Monitoring of Business Relationships",
      "body": "Once a business relationship is established, the MSB has an ongoing obligation to monitor it. Monitoring involves: (1) Reviewing transactions to ensure they are consistent with the client's risk profile, stated occupation, and business purpose. (2) Updating client identification and beneficial ownership information when it changes. (3) Re-screening for PEP status periodically. (4) Identifying any changes that increase the risk level and applying additional measures accordingly. Ongoing monitoring is not passive — it requires documented processes. A client whose transactions suddenly change pattern (e.g., amounts triple, new destinations appear) should trigger a review of the account and, if risk has increased, enhanced measures or an STR assessment."
    },
    {
      "title": "Consequences of CDD Failures",
      "body": "Failure to conduct adequate CDD is one of the most common deficiencies found in FINTRAC examinations. Each instance of failing to verify a client's identity at a triggering transaction is a separate violation. Systemic CDD failures — failing to implement any verification procedure — indicate a fundamental compliance program gap and attract the highest AMP levels. Beyond regulatory penalties, inadequate CDD means the MSB cannot assess whether a transaction is suspicious, cannot determine if a client is a PEP, and cannot respond accurately to a FINTRAC information request. CDD is also a reputational and legal risk: knowingly facilitating transactions for unidentified clients can, in extreme cases, constitute a criminal offence."
    }
  ]$sm06$::jsonb,
  $qz06$[
    {
      "question": "An MSB must verify a client's identity for foreign exchange transactions at or above:",
      "options": ["$500", "$1,000", "$3,000", "$10,000"],
      "answer": 2
    },
    {
      "question": "A Politically Exposed Person (PEP) includes someone who has held a qualifying senior role within the past:",
      "options": ["2 years", "3 years", "5 years", "10 years"],
      "answer": 2
    },
    {
      "question": "For Politically Exposed Foreign Persons (PEFPs), enhanced due diligence is required:",
      "options": ["Only if the transaction exceeds $10,000", "Only if the risk assessment rates them as high risk", "Automatically, regardless of assessed risk", "Only for first-time transactions"],
      "answer": 2
    },
    {
      "question": "The 'dual-process' method of identity verification uses:",
      "options": ["Two government-issued photo IDs", "Two independent sources — one for name/address, one for name/date of birth", "Two staff members reviewing the same document", "One document reviewed twice at different dates"],
      "answer": 1
    },
    {
      "question": "The beneficial ownership threshold that triggers identification requirements is:",
      "options": ["10% ownership or control", "15% ownership or control", "25% ownership or control", "51% ownership or control"],
      "answer": 2
    },
    {
      "question": "Enhanced due diligence for a foreign PEP requires which specific step not required for ordinary clients?",
      "options": ["Filing an LCTR", "Senior management approval before establishing or continuing the relationship", "Reporting to CSIS", "Obtaining a second passport copy"],
      "answer": 1
    },
    {
      "question": "A 'third party' in FINTRAC terminology is:",
      "options": ["FINTRAC itself", "The person on whose behalf a transaction is being conducted", "The correspondent bank processing the wire", "The compliance consultant advising the MSB"],
      "answer": 1
    },
    {
      "question": "Beneficial ownership information must be collected and verified within how many days of establishing a business relationship?",
      "options": ["7 days", "15 days", "30 days", "60 days"],
      "answer": 2
    },
    {
      "question": "Ongoing monitoring of a business relationship includes:",
      "options": ["Filing an STR after every transaction", "Reviewing transactions for consistency with the client's profile and updating client information as it changes", "Requiring new government-issued ID every 6 months", "Contacting FINTRAC monthly"],
      "answer": 1
    },
    {
      "question": "Which of the following is NOT a Politically Exposed Foreign Person (PEFP)?",
      "options": ["A foreign head of state", "A senior foreign military official", "The owner of a large private foreign company with no public role", "A foreign cabinet minister"],
      "answer": 2
    },
    {
      "question": "Identity verification records must be retained for:",
      "options": ["2 years", "3 years", "5 years", "7 years"],
      "answer": 2
    },
    {
      "question": "An MSB must verify a client's identity for virtual currency transactions at or above:",
      "options": ["$500", "$1,000", "$3,000", "$10,000"],
      "answer": 1
    }
  ]$qz06$::jsonb,
  $res06$[
    {"label": "FINTRAC — Client Identification Guide (Guide 11)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/Guide11/11-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Politically Exposed Persons Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/pep/pep-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Third Party Determination Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/client-clientele/tpd-dtiers/tpd-dtiers-eng", "type": "Official Guidance"},
    {"label": "PCMLTFR — Full Text (Justice Canada)", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"}
  ]$res06$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-07  Record Keeping & Retention  (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Record Keeping & Retention',
  'compliance',
  'fintrac_mandatory',
  true, 12, 45, 80,
  'All staff',
  'PCMLTFR Part 3 record-keeping obligations for MSBs — what to keep, for how long, and in what format.',
  $sm07$[
    {
      "title": "Why Records Matter — FINTRAC Examinations",
      "body": "FINTRAC's ability to examine an MSB depends entirely on the quality of that MSB's records. During an examination, FINTRAC reviewers will request transaction records, client identification files, STR documentation, LCTR/EFTR submission logs, beneficial ownership records, and training logs. An MSB that cannot produce a required record faces an AMP for failing to keep it — separate from any penalty for the underlying transaction. Records also serve the MSB's own interests: they are the evidence that due diligence was conducted, that a risk assessment was reasonable, and that staff were properly trained. In any legal proceeding, complete records are the best defence."
    },
    {
      "title": "The 5-Year Retention Period",
      "body": "Under the PCMLTFR, most records must be kept for a minimum of 5 years from the date the record was created (not the transaction date, and not from when the business relationship ended). For example: a client identification record created in January 2024 must be retained until at least January 2029. After 5 years, the record may be destroyed, but must not be destroyed before that. If FINTRAC has requested the records, they must be retained until the request is resolved regardless of the 5-year timeline. Some records — particularly those related to an ongoing examination or law-enforcement request — must be kept indefinitely until formally released."
    },
    {
      "title": "MSB-Specific Records — Foreign Exchange",
      "body": "For foreign currency exchange transactions at or above $3,000 (CAD equivalent), the PCMLTFR requires MSBs to record: the date of the transaction; the type and amount of each currency exchanged; the name and address of the client; the client's date of birth; and the type, number, and issuing jurisdiction of the identification document provided. The $3,000 threshold for foreign exchange records is lower than the $10,000 LCTR threshold. This means many transactions that do not trigger an LCTR still require a formal transaction record. Failing to maintain these records for every qualifying transaction is a common finding in FINTRAC MSB examinations."
    },
    {
      "title": "MSB-Specific Records — Remittances",
      "body": "For the initiation of a funds transfer (remittance) at or above $1,000, the PCMLTFR requires: the date of the transfer; the amount and currency; the name and address of the client; the client's date of birth and ID information; the name and address of the beneficiary; the account number or other information identifying the beneficiary; and the name of the recipient institution. For received remittances at or above $1,000, similar records must be kept for the originator. These records form the foundation for Travel Rule compliance and must be cross-referenced with EFTRs where applicable."
    },
    {
      "title": "Virtual Currency Transaction Records",
      "body": "For virtual currency transactions at or above $1,000, the PCMLTFR requires records of: the transaction date and amount in VC and CAD equivalent; the type of VC (Bitcoin, USDT, etc.); the client's name, address, and ID; the wallet address of the originator and beneficiary; and the transaction hash or unique identifier. For Large Virtual Currency Transaction Reports (LVCTR), the same 5-year record retention applies. These records are especially important because blockchain data is public but pseudonymous — the MSB's internal records are often the only way to link a wallet address to a real-world identity for law-enforcement purposes."
    },
    {
      "title": "Format and Accessibility of Records",
      "body": "Records can be kept in paper or electronic format, but the PCMLTFR requires that all records be 'readily retrievable' — FINTRAC must be able to access them within the timeframe specified in an information request (usually 30 days). Electronic records are acceptable and preferred for high-volume MSBs, but must be stored in a way that prevents tampering, ensures integrity, and allows export or printing. Cloud-based storage is acceptable if data residency requirements are met and the MSB can demonstrate control over the records. Deleted or corrupted records that were required to be kept constitute a violation even if the underlying transaction data still exists elsewhere."
    },
    {
      "title": "What a Client Cannot Ask You to Destroy",
      "body": "A common client request in compliance situations is to destroy records of their transactions — to 'forget' them. Under the PCMLTFR, an MSB has no discretion to comply: required records must be kept for the full 5-year retention period regardless of the client's request. Destroying required records in response to a client's request or instruction is itself a violation of the PCMLTFR and could, in the context of an ML/TF investigation, amount to obstruction of justice. The MSB should document any request to destroy records (which itself becomes part of the compliance file) and decline in writing. The client's insistence on record destruction is also a red flag that may warrant an STR assessment."
    }
  ]$sm07$::jsonb,
  $qz07$[
    {
      "question": "Under the PCMLTFR, most MSB records must be retained for a minimum of:",
      "options": ["2 years", "3 years", "5 years", "7 years"],
      "answer": 2
    },
    {
      "question": "The 5-year retention period begins from:",
      "options": ["The date the transaction was completed", "The date the record was created", "The date the client relationship ended", "The date FINTRAC last examined the MSB"],
      "answer": 1
    },
    {
      "question": "For foreign currency exchange transactions, records must be kept for exchanges at or above:",
      "options": ["$500", "$1,000", "$3,000", "$10,000"],
      "answer": 2
    },
    {
      "question": "MSB record-keeping obligations for transactions are found primarily in:",
      "options": ["PCMLTFA Part 2", "PCMLTFR Part 3", "PCMLTFR Part 4", "FINTRAC Guide 4"],
      "answer": 1
    },
    {
      "question": "A client asks you to destroy their transaction records. Under the PCMLTFR, you must:",
      "options": ["Comply if the client provides written consent", "Comply if the transaction was below $1,000", "Refuse — required records must be retained regardless", "Consult FINTRAC before deciding"],
      "answer": 2
    },
    {
      "question": "For an initiated remittance at or above $1,000, which of the following must be recorded?",
      "options": ["Only the amount and destination country", "The client's name, address, ID, beneficiary name and account, and recipient institution", "Only the SWIFT code of the recipient bank", "The client's SIN number"],
      "answer": 1
    },
    {
      "question": "Electronic records are acceptable under the PCMLTFR if:",
      "options": ["They are approved by FINTRAC in advance", "They are readily retrievable and their integrity can be demonstrated", "They are stored in Canada only", "They are printed monthly as paper backups"],
      "answer": 1
    },
    {
      "question": "For virtual currency transactions, which information must be recorded?",
      "options": ["Only the amount in CAD", "The VC type, amount, wallet address, client ID, and transaction hash or unique identifier", "Only the blockchain confirmation number", "Only the client's email address"],
      "answer": 1
    },
    {
      "question": "A client insisting on the destruction of their transaction records is:",
      "options": ["A normal privacy rights request that should be honoured", "A red flag that may warrant an STR assessment", "Permissible after 3 years", "Covered under PIPEDA consent rules"],
      "answer": 1
    },
    {
      "question": "An MSB is examined by FINTRAC and cannot produce a required transaction record from 3 years ago. What is the consequence?",
      "options": ["No consequence — FINTRAC only looks at records from the past year", "An AMP for failing to keep the required record", "A warning letter only", "The MSB must recreate the record from memory"],
      "answer": 1
    }
  ]$qz07$::jsonb,
  $res07$[
    {"label": "FINTRAC — Record Keeping for MSBs", "url": "https://fintrac-canafe.gc.ca/guidance-directives/recordkeeping-document/record/msb-eng", "type": "Official Guidance"},
    {"label": "PCMLTFR Part 3 — Record Keeping", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"}
  ]$res07$::jsonb,
  '[]'::jsonb
);

-- ---------------------------------------------------------------
-- F-08  Risk-Based Approach & Compliance Program  (INSERT)
-- ---------------------------------------------------------------
INSERT INTO public.training_courses
  (course_name, category, program_area, is_mandatory, frequency_months,
   estimated_minutes, pass_mark, role_requirement, description,
   study_materials, quiz, resources, attachments)
VALUES (
  'Risk-Based Approach & Compliance Program',
  'compliance',
  'fintrac_mandatory',
  true, 12, 60, 80,
  'Compliance, Management',
  'Building and maintaining a FINTRAC-compliant five-element compliance program using a risk-based approach — officer role, risk assessment, policies, training, and two-year effectiveness review.',
  $sm08$[
    {
      "title": "What Is a Risk-Based Approach?",
      "body": "A risk-based approach (RBA) to AML/ATF compliance means allocating resources and controls proportionately to the actual ML/TF risk posed by your clients, products, services, delivery channels, and geographic exposure. Rather than applying identical measures to every transaction regardless of risk, an RBA requires the MSB to: (1) identify and assess its specific ML/TF risks; (2) design controls that are stronger where risk is higher; and (3) document the rationale for each risk rating and control decision. FATF adopted the RBA as its global standard. FINTRAC's PCMLTFR requires MSBs to implement a risk assessment as one of the five mandatory compliance program elements. An RBA does not mean ignoring low-risk clients — it means calibrating vigilance to reality."
    },
    {
      "title": "Element 1 — The Compliance Officer",
      "body": "Every reporting entity must designate a compliance officer who is responsible for implementing and overseeing the compliance program. The compliance officer must have sufficient authority, resources, and independence to carry out the role effectively. For an MSB, the compliance officer should be a senior individual who reports directly to senior management or the board — not someone without decision-making power or budget authority. Key responsibilities include: keeping policies current, overseeing staff training, reviewing reports before submission, conducting or commissioning the effectiveness review, and serving as the primary contact for FINTRAC examinations. The designation must be documented, and FINTRAC can ask who holds the role during an examination."
    },
    {
      "title": "Element 2 — Written Policies and Procedures",
      "body": "The MSB must maintain written compliance policies and procedures tailored to its business activities, risk profile, and applicable legal obligations. Generic, template policies downloaded from the internet that do not reflect the MSB's actual operations are a common deficiency. Policies must cover, at minimum: client identification and verification; beneficial ownership; PEPs and third parties; record keeping and retention; STR, LCTR, and EFTR filing procedures; sanctions screening; and training. Procedures must be specific enough for staff to follow without ambiguity. Policies must be updated whenever regulations change, when new products or corridors are added, or when the risk assessment identifies new risk factors. All updates must be dated and version-controlled."
    },
    {
      "title": "Element 3 — The Risk Assessment",
      "body": "The risk assessment is a formal document evaluating the MSB's exposure to ML/TF risk across four dimensions: (1) Client risk — which client types are higher risk? (PEPs, cash-intensive businesses, clients in high-risk jurisdictions). (2) Product/service risk — which services carry higher ML/TF risk? (virtual currency, high-value international transfers). (3) Geographic risk — which corridors involve higher-risk countries? (FATF grey-listed or black-listed jurisdictions, sanctioned countries). (4) Delivery channel risk — are services delivered online with no in-person interaction? (higher risk than face-to-face). The risk assessment must be documented, approved by senior management, and updated whenever material changes occur to the business or the regulatory environment."
    },
    {
      "title": "Element 4 — The Training Program",
      "body": "All staff who deal with clients, handle transactions, or have compliance responsibilities must receive initial training before they begin their role and ongoing training at least annually. Training must be tailored to the employee's role — a front-line teller needs different content than a compliance officer. Training content must reflect current laws and internal policies. The MSB must keep records of: who was trained, when, and on what topics. FINTRAC will review training records during an examination and may test staff knowledge directly. This course and its assessment are part of eFinMoney's documented training program. Passing this assessment creates a training record that supports compliance."
    },
    {
      "title": "Element 5 — The Effectiveness Review",
      "body": "The compliance effectiveness review must be conducted at least every two years. Its purpose is to assess whether the compliance program is actually working — are policies being followed? are reports being filed on time? is training effective? The review must be conducted by someone sufficiently independent from day-to-day compliance operations — this could be an internal audit function or an external consultant. The reviewer examines policies, procedures, training records, a sample of transactions and STR decisions, and the risk assessment. The results must be documented in a written report, shared with senior management, and any deficiencies remediated. The last effectiveness review date and findings are a standard topic in a FINTRAC examination opening."
    },
    {
      "title": "Risk Assessment in Practice — eFinMoney",
      "body": "For eFinMoney, the risk assessment should address: (1) Corridors — Nigeria and Zambia are developing-market corridors; assess counterparty risk and local AML standards. (2) Virtual currency — if eFinMoney accepts VC for remittances, the VC risk must be assessed and reflected in controls. (3) Online-only delivery — no in-person verification; assess reliance on digital ID verification tools and their limitations. (4) Client base — remittance customers may include individuals sending funds to jurisdictions with elevated corruption or sanctions risks. (5) Consulting services — advisory relationships introduce different risk from transactional ones. The risk assessment is a living document; update it when corridors expand, products change, or regulatory risk ratings of jurisdictions shift."
    },
    {
      "title": "FINTRAC Examination Process",
      "body": "FINTRAC conducts compliance examinations in two forms: announced and unannounced. Announced examinations typically begin with a questionnaire requesting the MSB's policies, risk assessment, training records, and transaction data for a specified period. Unannounced examinations can occur at any business location at any time during operating hours. During an examination, FINTRAC reviewers will: interview the compliance officer; review a sample of transactions for LCTR/EFTR/STR compliance; test client identification records; review training logs; and assess all five program elements. Post-examination, FINTRAC issues a report of findings. Non-compliance findings can result in AMPs, compliance agreements, or enhanced monitoring. Cooperation and transparency during an examination is always the recommended approach."
    }
  ]$sm08$::jsonb,
  $qz08$[
    {
      "question": "How many mandatory elements must a FINTRAC compliance program contain?",
      "options": ["3", "4", "5", "6"],
      "answer": 2
    },
    {
      "question": "Which of the following is NOT one of the five mandatory elements of a FINTRAC compliance program?",
      "options": ["A designated compliance officer", "Written policies and procedures", "An annual external audit by a public accountant", "A risk assessment"],
      "answer": 2
    },
    {
      "question": "The compliance effectiveness review must be conducted at least every:",
      "options": ["6 months", "1 year", "2 years", "5 years"],
      "answer": 2
    },
    {
      "question": "The four dimensions of a risk-based AML/ATF risk assessment are:",
      "options": ["Client, transaction size, staff, and technology risks", "Client, product/service, geographic, and delivery channel risks", "Country, currency, account type, and frequency risks", "Regulatory, reputational, operational, and financial risks"],
      "answer": 1
    },
    {
      "question": "The compliance officer must report to:",
      "options": ["The front-line staff", "Senior management or the board", "FINTRAC directly", "The IT department"],
      "answer": 1
    },
    {
      "question": "Written compliance policies must be updated when:",
      "options": ["Only when FINTRAC requires it during an examination", "Whenever regulations change, new products are added, or new risks are identified", "Every 5 years during the effectiveness review cycle", "Only when the compliance officer changes"],
      "answer": 1
    },
    {
      "question": "Who must receive AML/ATF training under a FINTRAC compliance program?",
      "options": ["Only the compliance officer", "Only senior management", "All staff who deal with clients or handle transactions", "Only staff who submit FINTRAC reports"],
      "answer": 2
    },
    {
      "question": "The effectiveness review assesses whether:",
      "options": ["Staff know their salaries", "The compliance program is actually working — policies followed, reports filed on time, training effective", "FINTRAC examinations were passed", "The MSB has enough clients"],
      "answer": 1
    },
    {
      "question": "The maximum AMP FINTRAC can issue per violation is:",
      "options": ["$100,000", "$250,000", "$500,000", "$1,000,000"],
      "answer": 2
    },
    {
      "question": "A risk-based approach (RBA) means:",
      "options": ["Applying identical controls to all clients to avoid discrimination", "Calibrating controls proportionately to the actual ML/TF risk of each client, product, and geography", "Skipping due diligence for low-value transactions entirely", "Only applying enhanced measures when FINTRAC requests it"],
      "answer": 1
    },
    {
      "question": "FINTRAC can conduct compliance examinations:",
      "options": ["Only with 30 days notice", "Only after a complaint from law enforcement", "Both announced and unannounced, at any business location during operating hours", "Only once every 5 years"],
      "answer": 2
    },
    {
      "question": "Training records must show:",
      "options": ["Only who was trained", "Only the dates of training", "Who was trained, when, and on what topics", "Only whether training was completed or not"],
      "answer": 2
    }
  ]$qz08$::jsonb,
  $res08$[
    {"label": "FINTRAC — Risk-Based Approach Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Compliance Program Guide (Guide 4)", "url": "https://fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide4/4-eng", "type": "Official Guidance"},
    {"label": "FINTRAC — Compliance Examination Guidance", "url": "https://fintrac-canafe.gc.ca/guidance-directives/overview-apercu/cpf/cpf-eng.asp", "type": "Official Guidance"},
    {"label": "PCMLTFR — Compliance Program Requirements", "url": "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html", "type": "Statute"}
  ]$res08$::jsonb,
  '[]'::jsonb
);
