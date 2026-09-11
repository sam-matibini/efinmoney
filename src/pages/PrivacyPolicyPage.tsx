import { Link } from "react-router-dom";
import { Logo, Wordmark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <p>
        eFinMoney ("we", "us", "our") respects your privacy. This Privacy Policy explains how we
        collect, use, disclose, and safeguard your information when you use our website, mobile
        applications, and related services (collectively, the "Services"). By using the Services,
        you agree to the practices described in this policy.
      </p>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    body: (
      <>
        <p>We collect the following categories of information:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li><strong>Identity data</strong> — full name, date of birth, nationality, government-issued ID, and selfie images for KYC.</li>
          <li><strong>Contact data</strong> — email, phone number, residential and billing address.</li>
          <li><strong>Financial data</strong> — wallet balances, transaction history, payment methods, linked bank accounts, and beneficiary details.</li>
          <li><strong>Technical data</strong> — IP address, device identifiers, browser type, operating system, and cookies.</li>
          <li><strong>Usage data</strong> — pages visited, features used, time spent, and click patterns.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How We Use Your Information",
    body: (
      <>
        <p>We process your information to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Provide, operate, and maintain the Services and process your transactions.</li>
          <li>Verify your identity and comply with KYC, AML, sanctions, and other regulatory obligations.</li>
          <li>Detect, prevent, and respond to fraud, abuse, and security incidents.</li>
          <li>Communicate with you about your account, security alerts, and product updates.</li>
          <li>Improve the Services through analytics and product research.</li>
          <li>Comply with legal, tax, and reporting obligations in the jurisdictions where we operate.</li>
        </ul>
      </>
    ),
  },
  {
    id: "legal-basis",
    title: "4. Legal Basis for Processing",
    body: (
      <p>
        We process personal information based on (a) the performance of our contract with you,
        (b) your consent where required, (c) compliance with legal and regulatory obligations,
        and (d) our legitimate interests in operating, securing, and improving the Services.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "5. How We Share Information",
    body: (
      <>
        <p>We share information only with parties that help us run the Services, including:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li><strong>Payment & banking partners</strong> — Flutterwave, Stripe, Paysafe, Plaid, M-Pesa, Verto, and licensed correspondent banks.</li>
          <li><strong>Identity verification providers</strong> — Persona and other KYC/AML vendors.</li>
          <li><strong>Cloud and infrastructure providers</strong> — used for hosting, storage, and email delivery.</li>
          <li><strong>Regulators and law enforcement</strong> — when required by applicable law, court order, or to prevent harm.</li>
          <li><strong>Professional advisors</strong> — auditors, lawyers, and accountants under confidentiality.</li>
        </ul>
        <p className="mt-3">We do not sell your personal information.</p>
      </>
    ),
  },
  {
    id: "international",
    title: "6. International Data Transfers",
    body: (
      <p>
        Your information may be processed in countries other than the one in which you reside,
        including Canada, the United States, and the European Union. Where required, we rely on
        appropriate safeguards such as Standard Contractual Clauses to protect cross-border
        transfers.
      </p>
    ),
  },
  {
    id: "retention",
    title: "7. Data Retention",
    body: (
      <p>
        We retain personal information for as long as your account is active and for an additional
        period required to comply with legal, tax, accounting, and AML record-keeping obligations
        — typically a minimum of five (5) years after account closure, or longer where required.
      </p>
    ),
  },
  {
    id: "security",
    title: "8. Security",
    body: (
      <p>
        We implement industry-standard administrative, technical, and physical safeguards,
        including encryption in transit and at rest, role-based access control, multi-factor
        authentication, continuous monitoring, and independent security reviews. No system is
        completely secure; you are responsible for keeping your credentials confidential.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "9. Your Rights",
    body: (
      <>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Access, correct, or update your personal information.</li>
          <li>Request deletion of your information, subject to our legal retention obligations.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Withdraw consent where processing is based on consent.</li>
          <li>Lodge a complaint with your local data protection authority.</li>
        </ul>
        <p className="mt-3">To exercise any of these rights, contact us at <a className="text-primary underline" href="mailto:support@efin.money">support@efin.money</a>.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "10. Cookies & Tracking",
    body: (
      <p>
        We use cookies and similar technologies for authentication, security, preferences, and
        analytics. You can control cookies through your browser settings. Disabling certain
        cookies may affect the functionality of the Services.
      </p>
    ),
  },
  {
    id: "children",
    title: "11. Children's Privacy",
    body: (
      <p>
        The Services are not intended for individuals under 18 years of age. We do not knowingly
        collect personal information from children. If you believe a child has provided us
        information, please contact us so we can remove it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "12. Changes to This Policy",
    body: (
      <p>
        We may update this Privacy Policy from time to time. Material changes will be notified via
        email or in-app notice. The "Last updated" date below indicates when this policy was most
        recently revised.
      </p>
    ),
  },
  {
    id: "contact",
    title: "13. Contact Us",
    body: (
      <p>
        For privacy questions or requests, contact our Data Protection Officer at{" "}
        <a className="text-primary underline" href="mailto:support@efin.money">support@efin.money</a>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  const lastUpdated = "May 15, 2026";

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
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <span className="text-sm uppercase tracking-wider text-muted-foreground">Legal</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          How eFinMoney collects, uses, and protects your information.
        </p>
        <p className="text-sm text-muted-foreground mt-4">Last updated: {lastUpdated}</p>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        {/* TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2 text-sm">
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
              Questions? <a href="mailto:support@efin.money" className="text-primary underline">support@efin.money</a>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
