import { Link } from "react-router-dom";
import { Logo, Wordmark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROCESSING_TIMES: Array<{ method: string; time: string }> = [
  { method: "Debit/Credit Card", time: "5–10 business days" },
  { method: "Bank Transfer", time: "2–7 business days" },
  { method: "Mobile Money", time: "1–5 business days" },
  { method: "Wallet Balance", time: "Within 24 hours" },
  { method: "Virtual Account", time: "2–5 business days" },
];

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "scope",
    title: "1. Scope",
    body: (
      <>
        <p>
          This Refund Policy applies to all services offered by EfinMoney, including but not limited
          to:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>International money transfers</li>
          <li>Currency exchange</li>
          <li>Local and international bank transfers</li>
          <li>Mobile Money transfers</li>
          <li>Card-funded transactions</li>
          <li>Wallet deposits</li>
          <li>Virtual account payments</li>
          <li>Business payments</li>
          <li>Merchant collections</li>
          <li>Payment gateway services</li>
        </ul>
      </>
    ),
  },
  {
    id: "principles",
    title: "2. General Refund Principles",
    body: (
      <>
        <p>
          Because EfinMoney facilitates financial transactions, not every completed transaction is
          eligible for a refund.
        </p>
        <p className="mt-3">Refunds are considered only where permitted by:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Financial regulations</li>
          <li>Banking regulations</li>
          <li>Anti-Money Laundering (AML) laws</li>
          <li>Counter-Terrorist Financing (CTF) regulations</li>
          <li>Payment network rules</li>
          <li>Internal compliance policies</li>
        </ul>
      </>
    ),
  },
  {
    id: "eligible",
    title: "3. Eligible Refund Situations",
    body: (
      <>
        <p>A refund may be approved if:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>
            <strong>Duplicate payment</strong> — The customer was charged more than once for the
            same transaction.
          </li>
          <li>
            <strong>Failed transaction</strong> — Funds were debited but the transaction was
            unsuccessful, and the beneficiary did not receive the funds.
          </li>
          <li>
            <strong>System error</strong> — A technical issue within the EfinMoney platform caused
            an incorrect debit.
          </li>
          <li>
            <strong>Overpayment</strong> — The customer accidentally transferred an amount exceeding
            the intended payment, and recovery is possible.
          </li>
          <li>
            <strong>Unauthorized transaction</strong> — After investigation, EfinMoney determines
            that the transaction was unauthorized and meets all verification requirements.
          </li>
          <li>
            <strong>Cancelled transfer</strong> — The transfer has not yet been processed or paid to
            the recipient, and cancellation is still possible.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "non-refundable",
    title: "4. Non-Refundable Transactions",
    body: (
      <>
        <p>Refunds will generally not be provided for:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Successfully completed money transfers</li>
          <li>Currency exchange transactions that have already been executed</li>
          <li>Payments made using incorrect recipient information supplied by the customer</li>
          <li>Customer mistakes in account numbers, wallet numbers, or bank details</li>
          <li>Transactions delayed due to regulatory reviews</li>
          <li>Transactions held for compliance verification</li>
          <li>Transfers rejected due to sanctions screening</li>
          <li>Transfers involving fraudulent activity</li>
          <li>Payments made using stolen or unauthorized financial instruments</li>
          <li>Service fees already earned after successful processing</li>
        </ul>
      </>
    ),
  },
  {
    id: "fx",
    title: "5. Foreign Exchange Transactions",
    body: (
      <>
        <p>Exchange rates fluctuate continuously.</p>
        <p className="mt-3">Once a foreign exchange transaction has been completed:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>The exchange rate cannot be reversed.</li>
          <li>
            Any gain or loss resulting from market fluctuations is the responsibility of the
            customer.
          </li>
        </ul>
        <p className="mt-3">
          Refunds will normally be made at the prevailing exchange rate where required by law or
          operational necessity.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "6. Transfer Cancellation",
    body: (
      <>
        <p>A customer may request cancellation before the transaction has been processed.</p>
        <p className="mt-3">Cancellation is only possible if:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>The beneficiary has not received the funds.</li>
          <li>The payment has not entered settlement.</li>
          <li>No regulatory restrictions exist.</li>
        </ul>
        <p className="mt-3">Approved cancellations may be subject to applicable processing fees.</p>
      </>
    ),
  },
  {
    id: "failed",
    title: "7. Failed Transfers",
    body: (
      <>
        <p>Where a transfer fails due to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Banking system errors</li>
          <li>Payment processor failures</li>
          <li>Technical issues</li>
          <li>Connectivity failures</li>
        </ul>
        <p className="mt-3">And funds were successfully collected, EfinMoney will:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>reverse the transaction, or</li>
          <li>issue a refund to the original payment method.</li>
        </ul>
      </>
    ),
  },
  {
    id: "incorrect-info",
    title: "8. Incorrect Beneficiary Information",
    body: (
      <>
        <p>
          Customers are responsible for ensuring that all payment information is accurate before
          confirming a transaction.
        </p>
        <p className="mt-3">
          If incorrect information is provided, EfinMoney will make reasonable efforts to recover the
          funds but cannot guarantee recovery.
        </p>
        <p className="mt-3">
          Recovery fees charged by correspondent banks may be deducted from any recovered amount.
        </p>
      </>
    ),
  },
  {
    id: "compliance",
    title: "9. Compliance and Regulatory Reviews",
    body: (
      <>
        <p>Certain transactions may be delayed while undergoing:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Identity verification</li>
          <li>AML review</li>
          <li>Fraud screening</li>
          <li>Sanctions screening</li>
          <li>Source-of-funds verification</li>
        </ul>
        <p className="mt-3">
          These transactions are not considered failed transactions and are therefore not
          automatically eligible for refunds.
        </p>
      </>
    ),
  },
  {
    id: "fraud",
    title: "10. Fraud Prevention",
    body: (
      <>
        <p>
          EfinMoney reserves the right to delay, reject, suspend, or cancel transactions where fraud
          is suspected.
        </p>
        <p className="mt-3">Refunds may be withheld while investigations are ongoing.</p>
        <p className="mt-3">Where fraudulent activity is confirmed:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>refunds may be denied,</li>
          <li>accounts may be suspended,</li>
          <li>regulatory authorities may be notified.</li>
        </ul>
      </>
    ),
  },
  {
    id: "chargebacks",
    title: "11. Chargebacks",
    body: (
      <>
        <p>Customers should contact EfinMoney before initiating a card chargeback.</p>
        <p className="mt-3">Improper chargebacks may result in:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>suspension of services,</li>
          <li>account restriction,</li>
          <li>additional investigation.</li>
        </ul>
      </>
    ),
  },
  {
    id: "processing-time",
    title: "12. Refund Processing Time",
    body: (
      <>
        <p>Approved refunds are generally processed within:</p>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse text-base">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-6 font-semibold text-foreground">Payment Method</th>
                <th className="py-2 font-semibold text-foreground">Estimated Time</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSING_TIMES.map((row) => (
                <tr key={row.method} className="border-b border-border/50">
                  <td className="py-2 pr-6">{row.method}</td>
                  <td className="py-2">{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">Actual processing times depend on banks and payment partners.</p>
      </>
    ),
  },
  {
    id: "refund-method",
    title: "13. Refund Method",
    body: (
      <>
        <p>
          Refunds will ordinarily be issued using the original payment method used for the
          transaction.
        </p>
        <p className="mt-3">
          Where this is not possible, EfinMoney may refund through another verified method belonging
          to the same customer.
        </p>
      </>
    ),
  },
  {
    id: "fees",
    title: "14. Fees",
    body: (
      <>
        <p>
          Processing fees, network fees, correspondent bank charges, and foreign exchange costs may
          be deducted from refunds where permitted by law.
        </p>
        <p className="mt-3">
          Certain fees are non-refundable once the service has been successfully provided.
        </p>
      </>
    ),
  },
  {
    id: "responsibilities",
    title: "15. Customer Responsibilities",
    body: (
      <>
        <p>Customers agree to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>provide accurate payment information,</li>
          <li>verify recipient details,</li>
          <li>maintain updated identification documents,</li>
          <li>cooperate with compliance reviews,</li>
          <li>promptly report unauthorized activity.</li>
        </ul>
        <p className="mt-3">Failure to do so may affect refund eligibility.</p>
      </>
    ),
  },
  {
    id: "how-to-request",
    title: "16. How to Request a Refund",
    body: (
      <>
        <p>Customers requesting a refund should provide:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Full name</li>
          <li>Registered email address</li>
          <li>Transaction ID</li>
          <li>Date of transaction</li>
          <li>Amount paid</li>
          <li>Currency</li>
          <li>Reason for the refund request</li>
          <li>Supporting documentation (if applicable)</li>
        </ul>
        <p className="mt-3">
          Refund requests should be submitted within <strong>5 days</strong> of the transaction
          date. Only refund requests submitted during this window are eligible to be processed.
        </p>
      </>
    ),
  },
  {
    id: "review",
    title: "17. Review Process",
    body: (
      <>
        <p>Each refund request is individually reviewed.</p>
        <p className="mt-3">
          EfinMoney may request additional information before making a final decision.
        </p>
        <p className="mt-3">Submitting a request does not guarantee approval.</p>
      </>
    ),
  },
  {
    id: "refuse",
    title: "18. Right to Refuse Refunds",
    body: (
      <>
        <p>EfinMoney reserves the right to deny refund requests where:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>false information was provided,</li>
          <li>fraud is suspected,</li>
          <li>regulatory restrictions apply,</li>
          <li>the transaction was successfully completed,</li>
          <li>the request violates applicable laws or payment network rules.</li>
        </ul>
      </>
    ),
  },
  {
    id: "liability",
    title: "19. Limitation of Liability",
    body: (
      <>
        <p>EfinMoney shall not be liable for losses resulting from:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>customer errors,</li>
          <li>incorrect recipient details,</li>
          <li>banking delays,</li>
          <li>force majeure,</li>
          <li>exchange-rate fluctuations,</li>
          <li>actions of correspondent banks,</li>
          <li>government restrictions,</li>
          <li>sanctions enforcement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "changes",
    title: "20. Changes to This Policy",
    body: (
      <>
        <p>
          EfinMoney may update this Refund Policy at any time to reflect legal, regulatory, or
          operational changes.
        </p>
        <p className="mt-3">
          The updated version becomes effective immediately upon publication on our website.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "21. Contact Us",
    body: (
      <>
        <p>For refund requests or questions regarding this Refund Policy, please contact:</p>
        <div className="mt-3 space-y-1">
          <p className="font-semibold text-foreground">EfinMoney Customer Support</p>
          <p>
            Email:{" "}
            <a className="text-primary underline" href="mailto:support@efin.money">
              support@efin.money
            </a>
          </p>
          <p>
            Website:{" "}
            <a
              className="text-primary underline"
              href="https://www.efinmoney.com"
              target="_blank"
              rel="noreferrer"
            >
              https://www.efinmoney.com
            </a>
          </p>
          <p>Business Hours: Monday–Friday, 9:00 AM–5:00 PM (Eastern Time)</p>
        </div>
      </>
    ),
  },
];

export default function RefundPolicyPage() {
  const effectiveDate = "July 26, 2026";
  const lastUpdated = "July 26, 2026";

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
            <RotateCcw className="h-6 w-6 text-primary" />
          </div>
          <span className="text-sm uppercase tracking-wider text-muted-foreground">Legal</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Refund Policy</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          When refunds are available, how refund requests are processed, and the responsibilities of
          both EfinMoney and our customers.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Effective: {effectiveDate} &middot; Last updated: {lastUpdated}
        </p>
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
            {/* Intro */}
            <div className="space-y-3 text-base">
              <p>
                At EfinMoney, we are committed to providing secure, transparent, and reliable foreign
                exchange, cross-border payment, and money transfer services. We understand that
                situations may arise where customers request a refund or cancellation of a
                transaction.
              </p>
              <p>
                This Refund Policy explains when refunds are available, how refund requests are
                processed, and the responsibilities of both EfinMoney and our customers. It forms
                part of, and should be read together with, our{" "}
                <Link className="text-primary underline" to="/terms">Terms of Service</Link>.
              </p>
              <p>By using our platform, you agree to this Refund Policy.</p>
            </div>

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
