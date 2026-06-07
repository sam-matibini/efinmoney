import { Link } from "react-router-dom";
import { Logo, Wordmark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Mail, ArrowLeft, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "preamble",
    title: "Preamble",
    body: (
      <>
        <p>
          eFinMoney is a Canadian money services business (MSB) operated by eFintax
          Advisors Ltd. (dba eFinMoney) and registered with the Financial Transactions and
          Reports Analysis Centre of Canada (FINTRAC). This Compliance Statement
          summarises the policies, controls, and standards that govern eFinMoney's
          anti-money laundering (AML), counter-terrorist financing (CFT), sanctions,
          Enhanced Due Diligence (EDD), customer protection, and cybersecurity
          obligations.
        </p>
        <p>
          The program is designed to satisfy the{" "}
          <strong>Proceeds of Crime (Money Laundering) and Terrorist Financing Act
          (PCMLTFA)</strong> and its regulations (the <em>PCMLTFR</em>), FINTRAC
          guidance, OSFI sanctions guidance, the <em>United Nations Act</em>, the{" "}
          <em>Special Economic Measures Act (SEMA)</em>, the{" "}
          <em>Justice for Victims of Corrupt Foreign Officials Act (JVCFOA)</em>, the{" "}
          <em>Criminal Code</em> listed terrorist entities regime, PIPEDA, FATF
          Recommendations, and PCI-DSS — and to support partner banks, payment
          processors, and correspondent institutions during connectivity onboarding
          and ongoing due diligence reviews.
        </p>
      </>
    ),
  },
  {
    id: "governance",
    title: "1. Compliance Governance Structure",
    body: (
      <>
        <p>
          eFinMoney maintains a Board-approved AML/CFT program with formal oversight,
          a Compliance Officer designated as required by the PCMLTFR, and an
          independent audit function.
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li><strong>Board & Executive Oversight</strong> — annual approval of the AML/CFT policy and enterprise risk assessment.</li>
          <li><strong>Chief Compliance Officer (CCO)</strong> — AML governance and regulatory engagement.</li>
          <li><strong>Money Laundering Reporting Officer (MLRO)</strong> — STR filings, investigations, and FINTRAC liaison.</li>
          <li><strong>Risk Committee</strong> — enterprise risk approvals and policy exceptions.</li>
          <li><strong>Internal Audit</strong> — independent AML reviews and effectiveness testing.</li>
          <li><strong>Operations Team</strong> — front-line transaction monitoring and case handling.</li>
          <li><strong>Technology & Security Team</strong> — security controls, identity infrastructure, and AML tooling.</li>
          <li><strong>Whistleblower channel</strong> — confidential reporting to the CCO and Board, with non-retaliation protections.</li>
        </ul>
      </>
    ),
  },
  {
    id: "policy-statement",
    title: "2. AML/CFT Policy Statement",
    body: (
      <>
        <p>eFinMoney commits to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Preventing money laundering, terrorist financing, and proliferation financing.</li>
          <li>Full compliance with Canadian AML laws and FINTRAC guidance.</li>
          <li>Maintaining sanctions and ministerial-directive compliance.</li>
          <li>Implementing a risk-based approach to customer due diligence.</li>
          <li>Reporting suspicious transactions without delay and without tipping off the subject (PCMLTFA s.8).</li>
          <li>Conducting ongoing monitoring of business relationships.</li>
          <li>Protecting customer data and financial integrity.</li>
        </ul>
        <p className="mt-3"><strong>Applicable regulations:</strong> PCMLTFA & PCMLTFR; FINTRAC guidance; OSFI sanctions guidance; United Nations Act; SEMA; JVCFOA; Criminal Code listed-entity regime; PIPEDA; FATF Recommendations; PCI-DSS.</p>
      </>
    ),
  },
  {
    id: "risk-approach",
    title: "3. Customer Risk-Based Approach",
    body: (
      <>
        <p>Customers are classified into the following risk tiers:</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr><th className="text-left p-3">Tier</th><th className="text-left p-3">Examples</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-border"><td className="p-3 font-medium">Low</td><td className="p-3">Salaried individuals with stable activity</td></tr>
              <tr className="border-t border-border"><td className="p-3 font-medium">Medium</td><td className="p-3">SMEs and freelancers</td></tr>
              <tr className="border-t border-border"><td className="p-3 font-medium">High</td><td className="p-3">Cross-border remittance clients</td></tr>
              <tr className="border-t border-border"><td className="p-3 font-medium">Very High</td><td className="p-3">PEPs/HIOs, MSBs, crypto-related businesses</td></tr>
              <tr className="border-t border-border"><td className="p-3 font-medium">Prohibited</td><td className="p-3">Sanctioned entities and prohibited activities</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4"><strong>Risk-scoring factors:</strong> geography, transaction behaviour, industry type, product usage, delivery channel, source of funds, adverse media, and ownership structure.</p>
      </>
    ),
  },
  {
    id: "edd",
    title: "4. Enhanced Due Diligence (EDD)",
    body: (
      <>
        <p>EDD applies to Politically Exposed Persons (Domestic, Foreign, and HIOs), MSBs, crypto businesses, customers in higher-risk jurisdictions, cash-intensive businesses, high-volume merchants, and international remittance aggregators. PEP/HIO determinations are completed within 30 days for prescribed transactions, with senior management approval and a review of source of wealth and source of funds for high-risk PEPs.</p>
        <h4 className="font-semibold mt-4">Individual customers</h4>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Government-issued photo ID (with NFC chip read where supported)</li>
          <li>Selfie + liveness verification</li>
          <li>Proof of address</li>
          <li>Occupation and source-of-funds declaration</li>
          <li>Sanctions, PEP/HIO, and adverse-media screening</li>
        </ul>
        <h4 className="font-semibold mt-4">Business customers</h4>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Certificate of incorporation and business registration</li>
          <li>Tax identification</li>
          <li>Ultimate Beneficial Owner (UBO) identification at the <strong>25% ownership threshold</strong>, with reasonable measures to confirm accuracy</li>
          <li>Director and signing-authority verification</li>
          <li>Corporate structure chart</li>
          <li>Bank reference letter and licensing verification (where applicable)</li>
          <li>AML policy review and website / operational review</li>
        </ul>
      </>
    ),
  },
  {
    id: "sanctions",
    title: "5. Sanctions Compliance Program",
    body: (
      <>
        <p>eFinMoney screens customers, counterparties, and transactions against:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Canadian Consolidated Sanctions (SEMA, JVCFOA, UN Act, Criminal Code listed terrorist entities)</li>
          <li>United Nations Security Council Consolidated List</li>
          <li>OFAC SDN and consolidated lists</li>
          <li>UK HM Treasury / OFSI consolidated list</li>
          <li>European Union consolidated sanctions</li>
          <li>Internal blacklist and adverse-media databases</li>
        </ul>
        <h4 className="font-semibold mt-4">Screening controls</h4>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Real-time onboarding screening</li>
          <li>Real-time transaction screening</li>
          <li>Continuous re-screening on list updates</li>
          <li>Fuzzy matching and alias detection</li>
          <li>Manual compliance adjudication of hits</li>
        </ul>
      </>
    ),
  },
  {
    id: "monitoring",
    title: "6. Transaction Monitoring Framework",
    body: (
      <>
        <p>Automated rules and analytics monitor for:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Structuring / smurfing and rapid movement of funds</li>
          <li>Dormant-account reactivation</li>
          <li>High-risk corridor transfers and velocity anomalies</li>
          <li>Multiple failed logins, device/IP anomalies, mule-account indicators</li>
          <li>Excessive refunds or reversals</li>
        </ul>
        <p className="mt-3"><strong>Alert management:</strong> risk-based scoring, compliance investigation workflows, case escalation matrix, SAR/STR workflow integration, and tamper-evident audit logging.</p>
      </>
    ),
  },
  {
    id: "reporting",
    title: "7. Suspicious & Prescribed Reporting",
    body: (
      <>
        <p>eFinMoney files the following reports to FINTRAC in accordance with the PCMLTFA:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Suspicious Transaction Reports (STRs)</strong> — no monetary threshold; filed as soon as practicable after reasonable grounds to suspect are established.</li>
          <li><strong>Terrorist Property Reports (TPRs)</strong> — without delay where property is owned or controlled by a listed entity.</li>
          <li><strong>Large Cash Transaction Reports (LCTRs)</strong> — cash receipts of <strong>CAD 10,000 or more</strong> in a single transaction (or aggregated within 24 hours).</li>
          <li><strong>Large Virtual Currency Transaction Reports (LVCTRs)</strong> — virtual-currency receipts of <strong>CAD 10,000 or more</strong>, with the 24-hour aggregation rule.</li>
          <li><strong>Electronic Funds Transfer Reports (EFTRs)</strong> — international EFTs of <strong>CAD 10,000 or more</strong>.</li>
        </ul>
        <p className="mt-3">For all EFTs of <strong>CAD 1,000 or more</strong>, eFinMoney transmits originator and beneficiary information in line with the FATF Travel Rule. All filings observe FINTRAC timelines, record-keeping obligations, and confidentiality (no-tipping-off) requirements.</p>
      </>
    ),
  },
  {
    id: "kyc",
    title: "8. KYC & Identity Verification Standards",
    body: (
      <>
        <p>Identity is verified using government-recognised methods, including:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Government ID OCR and document authenticity checks</li>
          <li>NFC passport / eID chip verification</li>
          <li>Selfie biometric match and active liveness detection</li>
          <li>Bank-account verification (where used to corroborate identity)</li>
          <li>Device fingerprinting and mobile-number verification</li>
        </ul>
        <p className="mt-3"><strong>Ongoing monitoring:</strong> periodic KYC refresh, trigger-based re-verification, risk reassessment, and transaction-profile analysis throughout the business relationship.</p>
      </>
    ),
  },
  {
    id: "prohibited",
    title: "9. Prohibited Customers & Activities",
    body: (
      <>
        <p>eFinMoney does not onboard or facilitate transactions for:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Terrorist financing or listed terrorist entities</li>
          <li>Sanctioned individuals, entities, or jurisdictions</li>
          <li>Fraudulent businesses and shell banks</li>
          <li>Illegal gambling and unlicensed financial institutions</li>
          <li>Human trafficking and child exploitation</li>
          <li>Dark-web marketplaces and other illicit commerce</li>
        </ul>
      </>
    ),
  },
  {
    id: "records",
    title: "10. Record Retention",
    body: (
      <p>
        Records are retained for a <strong>minimum of five (5) years</strong> from the
        end of the business relationship (or longer where required), in encrypted
        storage with auditable retrieval. Retained records include KYC documents,
        transaction history, STR/TPR/LCTR/LVCTR/EFTR filings, monitoring alerts,
        risk assessments, and compliance decisions.
      </p>
    ),
  },
  {
    id: "training",
    title: "11. AML/CFT Training",
    body: (
      <>
        <p>All staff complete mandatory annual training covering AML obligations, suspicious-activity detection, sanctions compliance, fraud indicators, data protection, and escalation procedures. Enhanced, role-specific training is delivered to compliance, operations, and senior management.</p>
      </>
    ),
  },
  {
    id: "audit",
    title: "12. Independent AML Effectiveness Review",
    body: (
      <p>
        eFinMoney commissions an <strong>independent effectiveness review at least every
        two years</strong> in accordance with PCMLTFR s.156. The review evaluates AML
        controls, transaction-monitoring effectiveness, KYC compliance, STR reporting
        quality, sanctions controls, and governance. Findings and management
        remediation plans are reported to the Board.
      </p>
    ),
  },
  {
    id: "cyber",
    title: "13. Cybersecurity & Data Protection",
    body: (
      <>
        <p>Technical and organisational measures include:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Multi-factor authentication for customers and staff</li>
          <li>Encryption at rest and in transit (TLS 1.2+; AES-256)</li>
          <li>SIEM monitoring and continuous threat detection</li>
          <li>API security gateways with rate-limiting and IP controls</li>
          <li>Role-based access controls and least-privilege administration</li>
          <li>Independent penetration testing and vulnerability management</li>
          <li>Documented incident-response and breach-notification procedures (PIPEDA-aligned)</li>
        </ul>
        <p className="mt-3"><strong>Frameworks referenced:</strong> PCI-DSS, ISO/IEC 27001, and SOC 2 principles.</p>
      </>
    ),
  },
  {
    id: "connectivity-dd",
    title: "14. Banking & Connectivity Due Diligence",
    body: (
      <>
        <p>For banking, processor, and correspondent partners, eFinMoney supports full AML/CFT due-diligence review across:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Corporate information</strong> — legal entity, registration, jurisdiction, address, website, parent.</li>
          <li><strong>Licensing & regulatory status</strong> — FINTRAC MSB registration, provincial licences, foreign licences, regulatory history.</li>
          <li><strong>Ownership & governance</strong> — shareholders &gt;10%, UBOs, organisation chart, board, senior management, compliance reporting.</li>
          <li><strong>AML/CFT program</strong> — policies, risk assessment, scoring methodology, refresh frequency.</li>
          <li><strong>KYC & onboarding</strong> — individual and business verification, UBO checks, licensing verification.</li>
          <li><strong>Sanctions screening</strong> — coverage, frequency, ongoing monitoring.</li>
          <li><strong>Transaction monitoring & reporting</strong> — real-time monitoring, AI anomaly detection, STR procedures and escalation timelines.</li>
          <li><strong>Technology & security</strong> — MFA, encryption, penetration testing.</li>
          <li><strong>API security</strong> — OAuth/OpenID, rate limiting, IP whitelisting.</li>
          <li><strong>Third-party risk</strong> — vendor due diligence, AML clauses, ongoing monitoring.</li>
          <li><strong>Geographic exposure</strong> — active corridors, excluded high-risk countries, blocked sanctioned countries.</li>
          <li><strong>Products & services</strong> — mobile wallets, EFT/ACH, merchant payments, remittances, card issuing, ride-sharing payments, parcel-delivery settlement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "readiness",
    title: "15. Connectivity Approval Readiness",
    body: (
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr><th className="text-left p-3">Document</th><th className="text-left p-3">Status</th></tr>
          </thead>
          <tbody>
            {[
              ["AML/CFT Policy", "Required"],
              ["Enterprise Risk Assessment", "Required"],
              ["FINTRAC MSB Registration", "Required"],
              ["Business Registration", "Required"],
              ["Information Security Policy", "Required"],
              ["Sanctions Policy", "Required"],
              ["Incident Response Plan", "Required"],
              ["Penetration Test Report", "Recommended"],
              ["Independent AML Effectiveness Review", "Recommended"],
              ["Financial Statements", "Required"],
              ["Organisational Chart", "Required"],
            ].map(([doc, status]) => (
              <tr key={doc} className="border-t border-border">
                <td className="p-3">{doc}</td>
                <td className="p-3">
                  <Badge variant={status === "Required" ? "default" : "secondary"}>{status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "tech-stack",
    title: "16. Compliance Technology Stack",
    body: (
      <>
        <p>eFinMoney operates an integrated compliance stack:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>KYC provider integrations (Persona, Interac Verification Service)</li>
          <li>AML transaction-monitoring engine</li>
          <li>Sanctions and PEP screening engine</li>
          <li>Fraud-detection analytics</li>
          <li>Case-management platform</li>
          <li>Tamper-evident audit-trail system</li>
        </ul>
        <p className="mt-3"><strong>Banking & payments integrations:</strong> Stripe, Plaid, Interac, EFT/ACH processors, Circle Payments Network, and FINTRAC reporting workflows.</p>
      </>
    ),
  },
  {
    id: "alignment",
    title: "17. Regulatory Alignment",
    body: (
      <p>
        The eFinMoney compliance framework aligns with FATF Recommendations, FINTRAC
        MSB guidance, ISO/IEC 27001, PCI-DSS, PIPEDA, Canadian Open Banking standards,
        and AML/ATF best practices for fintechs.
      </p>
    ),
  },
];

export default function CompliancePage() {
  const lastUpdated = "June 7, 2026";

  return (
    <div className="min-h-screen bg-background">
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

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <span className="text-sm uppercase tracking-wider text-muted-foreground">Compliance</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          AML/CFT Compliance & Enhanced Due Diligence Framework
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">
          How eFinMoney prevents financial crime and meets Canadian and international
          regulatory standards.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <Badge variant="secondary">FINTRAC-registered MSB</Badge>
          <Badge variant="secondary">PCMLTFA / PCMLTFR</Badge>
          <Badge variant="secondary">FATF-aligned</Badge>
          <Badge variant="secondary">PIPEDA</Badge>
          <Badge variant="secondary">PCI-DSS</Badge>
          <Badge variant="secondary">ISO 27001</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-5">
          Effective: {lastUpdated} · Version 1.0 · Jurisdiction: Manitoba, Canada
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">On this page</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block text-muted-foreground hover:text-foreground transition-colors leading-snug"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <Card>
          <CardContent className="prose prose-invert max-w-none p-8 space-y-10 text-foreground/90 leading-relaxed">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-2xl font-semibold mb-4 text-foreground">{s.title}</h2>
                <div className="space-y-3 text-base">{s.body}</div>
              </section>
            ))}

            <div className="border-t border-border pt-6 grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <FileCheck2 className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Compliance enquiries</p>
                  <a className="text-primary underline" href="mailto:compliance@efin.money">compliance@efin.money</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">MLRO / STR matters</p>
                  <a className="text-primary underline" href="mailto:mlro@efin.money">mlro@efin.money</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Privacy (PIPEDA)</p>
                  <a className="text-primary underline" href="mailto:privacy@efin.money">privacy@efin.money</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">General</p>
                  <a className="text-primary underline" href="mailto:info@efintax.biz">info@efintax.biz</a>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground border-t border-border pt-4">
              eFintax Advisors Ltd. dba eFinMoney · Winnipeg, Manitoba, Canada ·
              FINTRAC-registered Money Services Business. This Compliance Statement is
              a high-level public summary of eFinMoney's AML/CFT program; it does not
              constitute legal advice and may be supplemented by internal policies,
              procedures, and confidential due-diligence packages provided under NDA
              to regulated counterparties.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
