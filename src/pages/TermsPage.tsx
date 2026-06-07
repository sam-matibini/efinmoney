import { Link } from "react-router-dom";
import { Logo, Wordmark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Scale, Mail, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const Email = ({ addr }: { addr: string }) => (
  <a className="text-primary underline" href={`mailto:${addr}`}>{addr}</a>
);

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "preamble",
    title: "Preamble",
    body: (
      <>
        <p>
          These Terms and Conditions of Service ("Terms") constitute a legally binding agreement
          between you ("User," "Client," or "you") and eFinMoney ("eFinMoney," "Company," "we,"
          "us," or "our"), a corporation duly registered and operating in the Province of Manitoba,
          Canada, and registered as a Money Services Business ("MSB") with the Financial
          Transactions and Reports Analysis Centre of Canada ("FINTRAC") under the <em>Proceeds of
          Crime (Money Laundering) and Terrorist Financing Act</em>, S.C. 2000, c. 17 ("PCMLTFA").
        </p>
        <p>
          By accessing, downloading, installing, or using the eFinMoney mobile application, website,
          or any related service (collectively, the "Platform"), you acknowledge that you have read,
          understood, and agree to be bound by these Terms in their entirety. If you do not agree to
          these Terms, you must immediately cease all use of the Platform.
        </p>
        <p>
          These Terms are written in plain language to the extent practicable, but they contain
          important legal obligations. You are encouraged to seek independent legal counsel before
          using the Platform if you have questions about these Terms.
        </p>
      </>
    ),
  },
  {
    id: "definitions",
    title: "1. Definitions",
    body: (
      <>
        <p>For the purposes of these Terms, the following definitions apply:</p>
        <ul className="list-none pl-0 space-y-2 mt-3">
          <li><strong>1.1 "Account"</strong> means a registered user account created on the Platform by a Client, enabling access to eFinMoney's services.</li>
          <li><strong>1.2 "AML/ATF"</strong> means Anti-Money Laundering and Anti-Terrorist Financing, as defined and regulated under the PCMLTFA and associated FINTRAC regulations.</li>
          <li><strong>1.3 "Business Day"</strong> means any day that is not a Saturday, Sunday, or public holiday in the Province of Manitoba.</li>
          <li><strong>1.4 "Chargeback"</strong> means a reversal of a payment transaction initiated by a Client's financial institution or card issuer.</li>
          <li><strong>1.5 "Client"</strong> means any individual or entity that has registered for and/or uses the Platform.</li>
          <li><strong>1.6 "Currency Exchange Rate"</strong> means the rate at which one currency is exchanged for another, as determined by eFinMoney at the time of the transaction.</li>
          <li><strong>1.7 "Electronic Signature"</strong> means any electronic sound, symbol, or process attached to or logically associated with a record and executed or adopted by a person with the intent to sign the record, as recognized under the <em>Electronic Commerce and Information Act</em>, C.C.S.M. c. E55 (Manitoba).</li>
          <li><strong>1.8 "FINTRAC"</strong> means the Financial Transactions and Reports Analysis Centre of Canada.</li>
          <li><strong>1.9 "Foreign Exchange"</strong> or <strong>"FX"</strong> means the exchange of one national currency for another.</li>
          <li><strong>1.10 "Mobile Money"</strong> means the transfer, storage, or management of funds using the Platform's mobile application.</li>
          <li><strong>1.11 "MSB"</strong> means Money Services Business as defined under the PCMLTFA.</li>
          <li><strong>1.12 "Personal Information"</strong> has the meaning ascribed to it under the <em>Personal Information Protection and Electronic Documents Act</em>, S.C. 2000, c. 5 ("PIPEDA") and the <em>Privacy Act</em>, R.S.C. 1985, c. P-21.</li>
          <li><strong>1.13 "Platform"</strong> means the eFinMoney mobile application, website (www.efinmoney.com), APIs, and all associated digital services.</li>
          <li><strong>1.14 "Prohibited Transaction"</strong> means any transaction that violates applicable law, these Terms, or eFinMoney's internal compliance policies.</li>
          <li><strong>1.15 "Services"</strong> means all financial services offered by eFinMoney through the Platform, including but not limited to Mobile Money transfers, Foreign Currency Swaps, Foreign Exchange transactions, and related ancillary services.</li>
          <li><strong>1.16 "Transaction"</strong> means any financial operation conducted through the Platform, including but not limited to transfers, currency conversions, payments, and remittances.</li>
          <li><strong>1.17 "User Funds"</strong> means any monetary value held, stored, or processed by eFinMoney on behalf of a Client.</li>
        </ul>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "2. Eligibility and Account Registration",
    body: (
      <>
        <p><strong>2.1 Age Requirement.</strong> You must be at least eighteen (18) years of age to use the Platform. By registering, you represent and warrant that you are eighteen (18) years of age or older.</p>
        <p><strong>2.2 Residency.</strong> The Platform is intended for use by individuals and entities lawfully residing in or operating from Canada. Use of the Platform from jurisdictions where the Services are prohibited by local law is strictly prohibited.</p>
        <p><strong>2.3 Registration Requirements.</strong> To access the Services, you must create an Account by providing accurate, complete, and current information, including:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Full legal name;</li>
          <li>Date of birth;</li>
          <li>Valid government-issued identification;</li>
          <li>Current residential address in Canada;</li>
          <li>Valid email address;</li>
          <li>Valid mobile telephone number;</li>
          <li>Any additional information required for identity verification or regulatory compliance.</li>
        </ul>
        <p><strong>2.4 Identity Verification.</strong> In accordance with FINTRAC regulations and eFinMoney's AML/ATF obligations, you agree to submit to identity verification procedures, including but not limited to Know Your Client ("KYC") and Customer Due Diligence ("CDD") checks. eFinMoney reserves the right to request additional documentation at any time, including proof of address, source of funds, and beneficial ownership information for corporate clients.</p>
        <p><strong>2.5 Account Security.</strong> You are solely responsible for maintaining the confidentiality of your Account credentials, including your password, PIN, and any two-factor authentication codes. You agree to notify eFinMoney immediately at <Email addr="compliance@efin.money" /> if you suspect unauthorized access to your Account.</p>
        <p><strong>2.6 One Account Per Person.</strong> Each individual may hold only one (1) personal Account on the Platform. Corporate clients may hold one (1) corporate Account per registered legal entity. eFinMoney reserves the right to merge, suspend, or terminate duplicate Accounts.</p>
        <p><strong>2.7 Account Accuracy.</strong> You agree to maintain the accuracy of your Account information and promptly update any information that becomes outdated or incorrect. Providing false, misleading, or incomplete information is a material breach of these Terms.</p>
      </>
    ),
  },
  {
    id: "services",
    title: "3. Description of Services",
    body: (
      <>
        <p><strong>3.1 Mobile Money Services.</strong> eFinMoney provides a mobile-based platform enabling Clients to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Send and receive money domestically and internationally;</li>
          <li>Store funds in a digital wallet;</li>
          <li>Make payments to participating merchants and service providers;</li>
          <li>Load and withdraw funds through supported payment methods.</li>
        </ul>
        <p><strong>3.2 Foreign Currency Swap.</strong> eFinMoney facilitates currency swap transactions whereby Clients may exchange one currency for another at the prevailing rate offered by eFinMoney, subject to applicable fees and limits.</p>
        <p><strong>3.3 Foreign Exchange Services.</strong> eFinMoney provides Foreign Exchange services, enabling Clients to convert Canadian dollars ("CAD") to or from foreign currencies for personal or business use, subject to applicable regulatory requirements.</p>
        <p><strong>3.4 Service Availability.</strong> The Platform and Services are available twenty-four (24) hours per day, seven (7) days per week, subject to scheduled or unscheduled maintenance, system upgrades, regulatory holds, or events beyond eFinMoney's reasonable control. eFinMoney does not guarantee uninterrupted or error-free service.</p>
        <p><strong>3.5 Service Modifications.</strong> eFinMoney reserves the right to modify, suspend, or discontinue any Service at any time, with or without notice, subject to applicable regulatory requirements. Where required by law, eFinMoney will provide reasonable advance notice of material changes.</p>
      </>
    ),
  },
  {
    id: "fintrac",
    title: "4. FINTRAC MSB Compliance",
    body: (
      <>
        <p><strong>4.1 Registration.</strong> eFinMoney is registered with FINTRAC as a Money Services Business pursuant to the PCMLTFA and its associated Regulations, including the <em>Proceeds of Crime (Money Laundering) and Terrorist Financing Regulations</em>, SOR/2002-184.</p>
        <p><strong>4.2 Reporting Obligations.</strong> As a registered MSB, eFinMoney is required to report to FINTRAC:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Large Cash Transactions (LCTs) involving CAD $10,000 or more in cash received in a single transaction or within twenty-four (24) hours;</li>
          <li>Suspicious Transaction Reports (STRs) for any transaction or attempted transaction that gives rise to reasonable grounds to suspect that it is related to money laundering or terrorist financing;</li>
          <li>Electronic Funds Transfer Reports (EFTRs) for international electronic transfers of CAD $10,000 or more;</li>
          <li>Terrorist Property Reports (TPRs) in the event that eFinMoney has possession or control of property owned or controlled by a listed terrorist group or individual.</li>
        </ul>
        <p><strong>4.3 Client Acknowledgement.</strong> You acknowledge and agree that eFinMoney's compliance with its FINTRAC reporting obligations is mandatory and non-negotiable, and that such reporting does not constitute a breach of confidentiality under these Terms or applicable privacy legislation.</p>
        <p><strong>4.4 Record Keeping.</strong> eFinMoney maintains records of all Transactions and Client identification information for a minimum of five (5) years from the date of the Transaction or the date of termination of the Client relationship, whichever is later, in accordance with FINTRAC requirements.</p>
      </>
    ),
  },
  {
    id: "aml-atf",
    title: "5. Anti-Money Laundering and Anti-Terrorist Financing (AML/ATF)",
    body: (
      <>
        <p><strong>5.1 AML/ATF Program.</strong> eFinMoney maintains a comprehensive AML/ATF compliance program in accordance with the PCMLTFA, including:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Written policies and procedures;</li>
          <li>Appointment of a designated AML/ATF Compliance Officer;</li>
          <li>Ongoing training of employees and agents;</li>
          <li>Risk-based assessment of Clients and Transactions;</li>
          <li>Regular review and audit of the compliance program.</li>
        </ul>
        <p><strong>5.2 Prohibited Uses.</strong> You expressly represent, warrant, and covenant that you will NOT use the Platform for:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Money laundering or any activity that violates the PCMLTFA or any applicable anti-money laundering law;</li>
          <li>Terrorist financing or the financing of any organization designated as a terrorist entity under the <em>Criminal Code</em>, R.S.C. 1985, c. C-46, the <em>United Nations Act</em>, R.S.C. 1985, c. U-2, or any applicable sanctions regime;</li>
          <li>Structuring transactions to avoid FINTRAC reporting thresholds ("smurfing");</li>
          <li>Conducting transactions on behalf of undisclosed principals or beneficial owners;</li>
          <li>Processing proceeds of crime or funds derived from illegal activity;</li>
          <li>Circumventing international sanctions administered by the Office of the Superintendent of Financial Institutions ("OSFI") or Global Affairs Canada.</li>
        </ul>
        <p><strong>5.3 Enhanced Due Diligence.</strong> eFinMoney may apply Enhanced Due Diligence ("EDD") measures to Clients or Transactions that present higher risk, including but not limited to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Politically Exposed Persons ("PEPs") as defined under the PCMLTFA;</li>
          <li>Heads of International Organizations ("HIOs");</li>
          <li>Third-party transactions;</li>
          <li>High-value or frequent transactions;</li>
          <li>Transactions involving high-risk jurisdictions as designated by FINTRAC or the Financial Action Task Force ("FATF").</li>
        </ul>
        <p><strong>5.4 Screening.</strong> eFinMoney screens Clients and transactions against applicable sanctions lists, including the Consolidated Canadian Autonomous Sanctions List, the United Nations Security Council Consolidated List, and other relevant lists. Any match may result in immediate suspension or termination of your Account and reporting to the appropriate authorities.</p>
        <p><strong>5.5 Cooperation.</strong> You agree to cooperate fully with eFinMoney's AML/ATF compliance procedures, including providing documentation and information upon request within a reasonable timeframe specified by eFinMoney. Failure to cooperate may result in suspension or termination of your Account.</p>
        <p><strong>5.6 No Liability for Compliance Actions.</strong> eFinMoney shall not be liable to you for any loss, damage, or inconvenience arising from actions taken in good faith pursuant to its AML/ATF obligations, including account suspension, transaction holds, or reporting to FINTRAC or law enforcement.</p>
      </>
    ),
  },
  {
    id: "fraud-security",
    title: "6. Fraud Prevention and Security",
    body: (
      <>
        <p><strong>6.1 Fraud Monitoring.</strong> eFinMoney employs real-time fraud monitoring systems to detect and prevent fraudulent activity on the Platform. These systems may include transaction pattern analysis, device fingerprinting, geolocation monitoring, and behavioral analytics.</p>
        <p><strong>6.2 Security Measures.</strong> eFinMoney implements the following security measures:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>End-to-end encryption of data transmissions using industry-standard protocols (TLS 1.2 or higher);</li>
          <li>Multi-factor authentication ("MFA") for Account access;</li>
          <li>Automated session timeouts;</li>
          <li>Real-time transaction monitoring and anomaly detection;</li>
          <li>Secure storage of sensitive data with AES-256 encryption;</li>
          <li>Regular penetration testing and security audits.</li>
        </ul>
        <p><strong>6.3 Client Obligations.</strong> You agree to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Never share your Account credentials with any third party;</li>
          <li>Promptly report any suspected fraud, unauthorized access, or security breach to eFinMoney at <Email addr="security@efin.money" /> or 1-800-eFIN-HELP;</li>
          <li>Refrain from using the Platform on unsecured or public Wi-Fi networks for sensitive transactions;</li>
          <li>Keep your mobile device's operating system and the eFinMoney application updated to the latest versions;</li>
          <li>Enable two-factor authentication on your Account;</li>
          <li>Report any lost or stolen device linked to your Account immediately.</li>
        </ul>
        <p><strong>6.4 Fraud Liability.</strong> In the event of unauthorized transactions resulting from your failure to comply with Section 6.3, eFinMoney's liability shall be limited as set out in Part V of these Terms. eFinMoney is not liable for losses arising from your own negligence or unauthorized disclosure of your credentials.</p>
        <p><strong>6.5 Transaction Holds.</strong> eFinMoney reserves the right to place a hold on any Transaction that triggers its fraud detection systems, pending review. eFinMoney will endeavor to resolve such holds within two (2) Business Days but may require additional time for complex cases.</p>
        <p><strong>6.6 Fraudulent Accounts.</strong> eFinMoney reserves the right to immediately suspend or permanently close any Account that it reasonably believes has been used for fraudulent purposes, and to report such activity to the appropriate law enforcement and regulatory authorities.</p>
      </>
    ),
  },
  {
    id: "fees",
    title: "7. Fees and Charges",
    body: (
      <>
        <p><strong>7.1 Fee Schedule.</strong> eFinMoney charges fees for its Services as set out in the Fee Schedule, which is published on the Platform and updated from time to time. The applicable fees will be disclosed to you before the completion of any Transaction.</p>
        <p><strong>7.2 Currency Conversion Fees.</strong> FX and currency swap transactions are subject to a spread (the difference between the rate at which eFinMoney buys and sells currency) as well as applicable transaction fees. The total cost of each FX Transaction will be disclosed prior to execution.</p>
        <p><strong>7.3 Fee Changes.</strong> eFinMoney reserves the right to change its fees at any time. Material fee changes will be communicated to you by email or in-app notification at least thirty (30) days in advance. Continued use of the Platform following notice of a fee change constitutes acceptance of the new fees.</p>
        <p><strong>7.4 Taxes.</strong> You are solely responsible for determining and paying any taxes applicable to your use of the Services, including applicable goods and services tax, harmonized sales tax, or income tax obligations arising from FX transactions or other financial activity on the Platform.</p>
      </>
    ),
  },
  {
    id: "limits",
    title: "8. Transaction Limits",
    body: (
      <>
        <p><strong>8.1 Default Limits.</strong> eFinMoney applies default transaction limits based on your verification level and risk profile. Limits may apply to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Individual transaction amounts;</li>
          <li>Daily, weekly, and monthly transaction volumes;</li>
          <li>International transfer amounts;</li>
          <li>Currency conversion volumes.</li>
        </ul>
        <p><strong>8.2 Limit Changes.</strong> Transaction limits may be adjusted based on your verification status, account history, regulatory requirements, or risk assessment. You may request a limit increase by contacting eFinMoney support and undergoing additional verification procedures.</p>
        <p><strong>8.3 Regulatory Limits.</strong> Certain transaction limits are imposed by regulation and cannot be overridden. eFinMoney will inform you of any regulatory limits applicable to your requested Transaction.</p>
      </>
    ),
  },
  {
    id: "chargebacks",
    title: "9. Chargebacks and Dispute Resolution",
    body: (
      <>
        <p><strong>9.1 Chargeback Policy.</strong> If you initiate a Chargeback with your financial institution or card issuer in respect of a Transaction completed on the Platform, eFinMoney reserves the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Immediately suspend your Account pending investigation;</li>
          <li>Recover the amount of the Chargeback, including any fees or penalties imposed on eFinMoney by payment processors, from your Account balance or future transactions;</li>
          <li>Terminate your Account if the Chargeback is determined to be fraudulent or unjustified.</li>
        </ul>
        <p><strong>9.2 Chargeback Investigations.</strong> eFinMoney will cooperate with your financial institution's Chargeback investigation process and may provide transaction records, IP logs, device data, and other information to dispute the Chargeback where warranted.</p>
        <p><strong>9.3 Legitimate Disputes.</strong> If you believe a Transaction was made in error or you did not authorize a Transaction, you must contact eFinMoney at <Email addr="disputes@efin.money" /> before initiating a Chargeback with your financial institution. eFinMoney will investigate your complaint and, if warranted, process a refund directly.</p>
        <p><strong>9.4 Dispute Timeframes.</strong> You must report any disputed Transaction to eFinMoney within thirty (30) calendar days of the Transaction date. Disputes raised after this period may not be eligible for resolution.</p>
        <p><strong>9.5 Refund Policy.</strong> FX and currency conversion transactions are generally non-refundable once executed, as rates fluctuate continuously. Refunds may be granted at eFinMoney's sole discretion in cases of demonstrable error on eFinMoney's part.</p>
        <p><strong>9.6 Chargeback Abuse.</strong> Repeated or abusive Chargeback activity may result in permanent Account suspension and referral to collection agencies or law enforcement.</p>
      </>
    ),
  },
  {
    id: "fx-risk",
    title: "10. Foreign Exchange Risk Disclosures",
    body: (
      <>
        <p><strong>10.1 Market Risk.</strong> Foreign exchange rates fluctuate continuously due to market forces, including geopolitical events, interest rate changes, economic data releases, and other factors beyond the control of eFinMoney. The value of foreign currency transactions may increase or decrease between the time of your request and the time of execution.</p>
        <p><strong>10.2 Rate Lock.</strong> The exchange rate quoted to you at the time of your Transaction is locked for the duration of that Transaction only. eFinMoney does not offer rate lock guarantees for future transactions unless explicitly stated in a separate written agreement.</p>
        <p><strong>10.3 No Investment Advice.</strong> The FX Services provided by eFinMoney are for currency exchange purposes only and do not constitute investment advice, financial advice, or a recommendation to buy, sell, or hold any currency. You should seek independent financial advice before engaging in significant currency exchange activity.</p>
        <p><strong>10.4 Third-Party Rate Risk.</strong> Rates available through the Platform may differ from interbank rates or rates available through other providers. eFinMoney's rates include a spread and transaction fees.</p>
        <p><strong>10.5 Regulatory Risk.</strong> Currency exchange transactions may be subject to regulatory restrictions, capital controls, or reporting requirements in the destination country. You are responsible for ensuring compliance with all applicable laws in the jurisdiction where funds are received.</p>
        <p><strong>10.6 Liquidity Risk.</strong> In periods of market stress, certain currency pairs may not be available for exchange through the Platform. eFinMoney reserves the right to suspend FX Services for specific currencies at any time.</p>
        <p><strong>10.7 Acknowledgement of Risk.</strong> By using the FX Services, you acknowledge that you understand the inherent risks of foreign currency exchange and that eFinMoney is not liable for any losses arising from currency rate fluctuations.</p>
      </>
    ),
  },
  {
    id: "esign",
    title: "11. Electronic Signature Consent",
    body: (
      <>
        <p><strong>11.1 Electronic Signature Act Compliance.</strong> In accordance with the <em>Electronic Commerce and Information Act</em>, C.C.S.M. c. E55 (Manitoba) and applicable federal legislation, you consent to the use of Electronic Signatures for all agreements, consents, authorizations, and communications between you and eFinMoney.</p>
        <p><strong>11.2 Scope of Consent.</strong> Your Electronic Signature consent applies to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>These Terms and Conditions;</li>
          <li>The Privacy Statement;</li>
          <li>The Service Agreement;</li>
          <li>Transaction confirmations and receipts;</li>
          <li>Account amendments and notifications;</li>
          <li>Any other documents or communications that you authorize through the Platform.</li>
        </ul>
        <p><strong>11.3 Method of Electronic Signature.</strong> Your Electronic Signature may be evidenced by:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Clicking "I Agree," "Accept," "Confirm," or similar affirmative actions on the Platform;</li>
          <li>Entering your PIN, password, or biometric authentication;</li>
          <li>Entering a one-time passcode ("OTP") for transaction authorization;</li>
          <li>Any other method designated by eFinMoney as an Electronic Signature.</li>
        </ul>
        <p><strong>11.4 Right to Receive Paper Copies.</strong> You have the right to request a paper copy of any electronically signed document. To request a paper copy, contact eFinMoney at <Email addr="support@efin.money" />. eFinMoney may charge a reasonable fee for paper copies.</p>
        <p><strong>11.5 Withdrawal of Consent.</strong> You may withdraw your consent to Electronic Signatures at any time by contacting eFinMoney at <Email addr="support@efin.money" />. Withdrawal of consent may result in the suspension of your ability to use certain features of the Platform, as many Services require electronic authorization.</p>
        <p><strong>11.6 Record Retention.</strong> eFinMoney retains records of all electronically signed documents in accordance with its record-keeping obligations under applicable legislation.</p>
      </>
    ),
  },
  {
    id: "communications",
    title: "12. Electronic Communications",
    body: (
      <>
        <p><strong>12.1 Consent to Electronic Communications.</strong> By creating an Account, you consent to receive all communications from eFinMoney electronically, including:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Account statements and transaction receipts;</li>
          <li>Fee disclosures and rate information;</li>
          <li>Regulatory notices;</li>
          <li>Marketing and promotional materials (subject to your preferences);</li>
          <li>Notices of changes to these Terms, the Privacy Statement, or the Service Agreement.</li>
        </ul>
        <p><strong>12.2 Communication Methods.</strong> eFinMoney may communicate with you by:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Email to the address on file;</li>
          <li>In-app notifications;</li>
          <li>SMS/text message to your registered mobile number;</li>
          <li>Push notifications through the Platform.</li>
        </ul>
        <p><strong>12.3 Notification Accuracy.</strong> You are responsible for maintaining accurate contact information in your Account. eFinMoney is not responsible for failed delivery of notices where your contact information is inaccurate or outdated.</p>
      </>
    ),
  },
  {
    id: "liability",
    title: "13. Limitation of Liability",
    body: (
      <>
        <p><strong>13.1 No Guarantee of Results.</strong> eFinMoney does not guarantee that use of the Platform will result in financial gain or favorable exchange rates.</p>
        <p><strong>13.2 Limitation on Damages.</strong> To the maximum extent permitted by the laws of Manitoba and Canada, eFinMoney's total aggregate liability to you for any claim arising from or related to these Terms, the Platform, or the Services shall not exceed the lesser of:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The total fees paid by you to eFinMoney in the twelve (12) months immediately preceding the event giving rise to the claim; or</li>
          <li>CAD $1,000.</li>
        </ul>
        <p><strong>13.3 Exclusion of Consequential Damages.</strong> To the maximum extent permitted by applicable law, eFinMoney shall not be liable for any indirect, incidental, special, punitive, exemplary, or consequential damages, including but not limited to loss of profits, loss of data, loss of goodwill, or loss of business opportunity, arising from your use of the Platform or Services.</p>
        <p><strong>13.4 Force Majeure.</strong> eFinMoney shall not be liable for any failure or delay in performance resulting from causes beyond its reasonable control, including but not limited to acts of God, war, terrorism, government actions, regulatory restrictions, natural disasters, pandemics, strikes, power failures, or internet outages.</p>
        <p><strong>13.5 Third-Party Services.</strong> eFinMoney is not responsible for the acts or omissions of third-party service providers, payment processors, financial institutions, or telecommunications carriers that are involved in the processing of your Transactions.</p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "14. Disclaimer of Warranties",
    body: (
      <>
        <p><strong>14.1</strong> The Platform and Services are provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement, to the maximum extent permitted by applicable law.</p>
        <p><strong>14.2</strong> eFinMoney does not warrant that:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The Platform will be available at all times or without interruption;</li>
          <li>The Platform will be free of errors, viruses, or other harmful components;</li>
          <li>Transaction results or exchange rates will meet your expectations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "15. Indemnification",
    body: (
      <>
        <p><strong>15.1</strong> You agree to indemnify, defend, and hold harmless eFinMoney, its officers, directors, employees, agents, partners, and licensors from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising from or related to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Your violation of these Terms;</li>
          <li>Your use of the Platform or Services;</li>
          <li>Your violation of any applicable law or regulation;</li>
          <li>Any fraudulent, deceptive, or illegal activity conducted through your Account;</li>
          <li>Your infringement of any third party's rights.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cross-border",
    title: "16. Cross-Border Data Transfers",
    body: (
      <>
        <p><strong>16.1 Data Processing Locations.</strong> eFinMoney's servers and data processing infrastructure may be located in Canada, the United States, and other countries. By using the Platform, you acknowledge and consent to the transfer, storage, and processing of your Personal Information outside of Canada, including in jurisdictions that may have different privacy laws than those applicable in Manitoba.</p>
        <p><strong>16.2 Safeguards.</strong> eFinMoney implements contractual safeguards, including data processing agreements and standard contractual clauses, with third-party processors to ensure that your Personal Information receives an adequate level of protection regardless of where it is processed.</p>
        <p><strong>16.3 PIPEDA Compliance.</strong> Cross-border data transfers are conducted in compliance with PIPEDA and applicable provincial privacy legislation. You may contact eFinMoney's Privacy Officer at <Email addr="privacy@efin.money" /> for information about the countries to which your data may be transferred and the safeguards in place.</p>
        <p><strong>16.4 U.S. Data Transfers.</strong> Where Personal Information is transferred to service providers in the United States, eFinMoney ensures such providers are bound by contractual obligations consistent with PIPEDA, notwithstanding that U.S. law may permit government access to such information in certain circumstances.</p>
      </>
    ),
  },
  {
    id: "termination",
    title: "17. Suspension and Termination",
    body: (
      <>
        <p><strong>17.1 Termination by Client.</strong> You may close your Account at any time by contacting eFinMoney at <Email addr="support@efin.money" />. Prior to closing your Account, you must:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Withdraw all remaining funds from your Account;</li>
          <li>Resolve any outstanding transactions, disputes, or obligations;</li>
          <li>Confirm that no holds or freezes are in place on your Account.</li>
        </ul>
        <p><strong>17.2 Termination by eFinMoney.</strong> eFinMoney reserves the right to suspend, restrict, or terminate your Account at any time, with or without notice, in the following circumstances:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Violation of these Terms or any applicable law;</li>
          <li>Failure to complete identity verification;</li>
          <li>Suspicious or fraudulent activity;</li>
          <li>AML/ATF compliance concerns;</li>
          <li>Regulatory requirement or direction from a competent authority;</li>
          <li>Inactivity for a period exceeding twelve (12) consecutive months;</li>
          <li>At eFinMoney's sole discretion, where continued provision of Services presents unacceptable risk.</li>
        </ul>
        <p><strong>17.3 Effects of Termination.</strong> Upon termination of your Account:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Access to the Platform will be immediately revoked;</li>
          <li>Any pending Transactions may be cancelled or reversed;</li>
          <li>eFinMoney will return any remaining User Funds to you, less applicable fees and any amounts owed to eFinMoney, within a reasonable time, subject to any legal holds, regulatory requirements, or dispute resolution procedures.</li>
        </ul>
        <p><strong>17.4 Record Retention Post-Termination.</strong> eFinMoney will retain your account records and transaction history for a minimum of five (5) years following Account closure, in accordance with FINTRAC requirements.</p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "18. Governing Law",
    body: (
      <>
        <p><strong>18.1</strong> These Terms are governed by and construed in accordance with the laws of the Province of Manitoba and the federal laws of Canada applicable therein, without regard to conflict of law principles.</p>
        <p><strong>18.2</strong> The United Nations Convention on Contracts for the International Sale of Goods ("CISG") does not apply to these Terms.</p>
      </>
    ),
  },
  {
    id: "dispute-resolution",
    title: "19. Dispute Resolution",
    body: (
      <>
        <p><strong>19.1 Informal Resolution.</strong> In the event of any dispute, claim, or controversy arising from or relating to these Terms or the Services ("Dispute"), you agree to first contact eFinMoney at <Email addr="disputes@efin.money" /> and provide a written description of the Dispute. eFinMoney will endeavor to resolve the Dispute informally within thirty (30) calendar days.</p>
        <p><strong>19.2 Mediation.</strong> If the Dispute cannot be resolved informally, either party may request non-binding mediation administered by a mutually agreed mediator in Winnipeg, Manitoba.</p>
        <p><strong>19.3 Court Jurisdiction.</strong> If mediation is unsuccessful, the parties submit to the exclusive jurisdiction of the courts of the Province of Manitoba, sitting in Winnipeg, for the resolution of any Dispute.</p>
        <p><strong>19.4 Class Action Waiver.</strong> To the maximum extent permitted by applicable law, you waive your right to participate in any class action, collective action, or representative proceeding against eFinMoney.</p>
      </>
    ),
  },
  {
    id: "amendments",
    title: "20. Amendments",
    body: (
      <>
        <p><strong>20.1</strong> eFinMoney reserves the right to amend these Terms at any time. Amendments will be communicated to you by email and/or in-app notification at least thirty (30) days prior to taking effect for material changes.</p>
        <p><strong>20.2</strong> Your continued use of the Platform after the effective date of any amendment constitutes acceptance of the amended Terms.</p>
        <p><strong>20.3</strong> If you do not agree to amended Terms, you must immediately cease use of the Platform and close your Account in accordance with Section 17.1.</p>
      </>
    ),
  },
  {
    id: "miscellaneous",
    title: "21. Miscellaneous",
    body: (
      <>
        <p><strong>21.1 Entire Agreement.</strong> These Terms, together with the Privacy Statement and Service Agreement, constitute the entire agreement between you and eFinMoney with respect to your use of the Platform and supersede all prior agreements, representations, and understandings.</p>
        <p><strong>21.2 Severability.</strong> If any provision of these Terms is found to be invalid or unenforceable by a court of competent jurisdiction, that provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall continue in full force and effect.</p>
        <p><strong>21.3 Waiver.</strong> Failure by eFinMoney to enforce any provision of these Terms shall not constitute a waiver of its right to enforce such provision in the future.</p>
        <p><strong>21.4 Assignment.</strong> You may not assign your rights or obligations under these Terms without eFinMoney's prior written consent. eFinMoney may assign these Terms to any successor entity or in connection with a merger, acquisition, or sale of substantially all of its assets.</p>
        <p><strong>21.5 Language.</strong> These Terms are written in English. If a translation is provided for convenience, the English version shall prevail in the event of any inconsistency.</p>
        <p>
          <strong>21.6 Contact Information.</strong><br />
          <strong>eFintax Advisors Ltd dba eFinMoney</strong><br />
          Compliance and Legal Department<br />
          Winnipeg, Manitoba, Canada<br />
          Email: <Email addr="legal@efin.money" /><br />
          Support: <Email addr="support@efin.money" /><br />
          Compliance: <Email addr="compliance@efin.money" /><br />
          Security: <Email addr="security@efin.money" /><br />
          Disputes: <Email addr="disputes@efin.money" />
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  const effectiveDate = "June 6, 2026";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <Wordmark className="font-black text-lg" />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" /> Back to home</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
            <Scale className="h-6 w-6 text-primary" />
          </div>
          <span className="text-sm uppercase tracking-wider text-muted-foreground">Legal</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Terms and Conditions of Service</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          The legally binding agreement that governs your use of the eFinMoney Platform.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-xs uppercase text-muted-foreground">Effective Date</div>
            <div className="font-medium mt-1">{effectiveDate}</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-xs uppercase text-muted-foreground">Jurisdiction</div>
            <div className="font-medium mt-1">Province of Manitoba, Canada</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-xs uppercase text-muted-foreground">Governing Law</div>
            <div className="font-medium mt-1">Manitoba & Canada</div>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          FINTRAC-registered Money Services Business
        </div>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
        {/* TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2 text-sm max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">On this page</p>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block text-muted-foreground hover:text-foreground transition-colors leading-snug">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Body */}
        <Card>
          <CardContent className="prose prose-invert max-w-none p-8 space-y-10 text-foreground/90 leading-relaxed">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-2xl font-semibold mb-4 text-foreground">{s.title}</h2>
                <div className="space-y-3 text-base">{s.body}</div>
              </section>
            ))}

            <div className="border-t border-border pt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              Questions? <a href="mailto:legal@efin.money" className="text-primary underline">legal@efin.money</a>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
