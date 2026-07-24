import { Link } from "react-router-dom";
import { Logo, Wordmark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "overview",
    title: "1. Overview",
    body: (
      <p>
        eFinMoney ("we", "us", "our") provides cross-border money transfer, currency exchange,
        wallet, and card services (collectively, the "Services"). This Refund, Return &
        Cancellation Policy explains when a transaction may be cancelled, when and how a refund is
        issued, and the fees that may apply. It forms part of, and should be read together with,
        our <Link className="text-primary underline" to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: "nature",
    title: "2. Nature of Our Services",
    body: (
      <p>
        Our Services are financial services, not physical goods. A "transfer" is complete once the
        funds have been delivered to, or made available at, the recipient's account, wallet, or
        cash-out partner. Because completed transfers move value irrevocably to a third party, they
        generally cannot be reversed. The sections below explain the limited circumstances in which
        a cancellation or refund is available.
      </p>
    ),
  },
  {
    id: "cancellation",
    title: "3. Cancelling a Transfer",
    body: (
      <>
        <p>
          You may request cancellation of a transfer <strong>before it is completed</strong>. A
          transfer can be cancelled while its status is <em>Pending</em>, <em>Processing</em>, or
          <em> On hold</em>. Once the status is <em>Completed</em>, <em>Paid out</em>, or
          <em> Delivered</em>, it can no longer be cancelled.
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Cancel from the transaction detail screen in the app, or contact support (below).</li>
          <li>
            If the transfer has not yet been sent to our payout partner, you receive a{" "}
            <strong>full refund</strong>, including any transfer fee.
          </li>
          <li>
            If payout is already in progress, cancellation may not be possible; we will attempt a
            recall on a best-effort basis and refund whatever is recoverable.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "eligible-refunds",
    title: "4. When You Are Eligible for a Refund",
    body: (
      <>
        <p>You are entitled to a refund in the following situations:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>The transfer was cancelled before funds were delivered to the recipient.</li>
          <li>The transfer failed, was rejected, or could not be delivered by our payout partner.</li>
          <li>You were charged in error, or charged a duplicate amount for the same transfer.</li>
          <li>
            The transfer could not be completed because it did not pass compliance, sanctions, or
            fraud screening (the principal amount is returned; see Section 6 on fees).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "not-eligible",
    title: "5. When a Refund Is Not Available",
    body: (
      <>
        <p>Refunds are generally not available where:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>The funds have already been delivered to the recipient you specified.</li>
          <li>
            You provided incorrect recipient details (name, account number, wallet, or bank) and
            the funds were delivered as instructed. We will assist with recovery but cannot
            guarantee it.
          </li>
          <li>The currency exchange has been executed and market rates have since moved.</li>
          <li>The request relates to a completed, authorised card purchase made by you.</li>
        </ul>
      </>
    ),
  },
  {
    id: "fees",
    title: "6. Fees and Exchange Rates",
    body: (
      <>
        <p>
          Where a transfer is cancelled before processing, or fails through no fault of your own,
          both the principal and any transfer fee are refunded in full.
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>
            Where funds are returned after a currency conversion has taken place, the refund is made
            at the prevailing exchange rate at the time of the refund, which may differ from the
            original rate.
          </li>
          <li>
            Third-party network, correspondent-bank, or payout-partner fees that have already been
            incurred may be non-refundable and deducted from the returned amount.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-to-request",
    title: "7. How to Request a Refund or Cancellation",
    body: (
      <>
        <p>To request a cancellation or refund:</p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>Open the transaction in the app and select <strong>Cancel</strong> or <strong>Report an issue</strong>; or</li>
          <li>Email <a className="text-primary underline" href="mailto:support@efin.money">support@efin.money</a> with your transaction reference.</li>
        </ul>
        <p className="mt-3">
          Please include your transaction reference, the date, the amount, and the reason for the
          request so we can act quickly.
        </p>
      </>
    ),
  },
  {
    id: "processing-time",
    title: "8. Refund Processing Times",
    body: (
      <>
        <p>
          Approved refunds are returned to your eFinMoney wallet or original payment method. Typical
          timelines are:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li><strong>To your eFinMoney wallet</strong> — usually within 1 business day of approval.</li>
          <li><strong>To a card or bank account</strong> — typically 5–10 business days, depending on your bank or card issuer.</li>
        </ul>
        <p className="mt-3">
          We aim to review every refund request within 2 business days and will keep you informed of
          its status.
        </p>
      </>
    ),
  },
  {
    id: "disputes",
    title: "9. Disputes and Chargebacks",
    body: (
      <p>
        If you believe a charge is unauthorised or incorrect, contact us first at{" "}
        <a className="text-primary underline" href="mailto:support@efin.money">support@efin.money</a> so
        we can resolve it quickly. If you remain unsatisfied, you may raise a dispute with your card
        issuer or bank. We cooperate fully with legitimate dispute and chargeback investigations and
        will provide supporting transaction records as required.
      </p>
    ),
  },
  {
    id: "changes",
    title: "10. Changes to This Policy",
    body: (
      <p>
        We may update this policy from time to time. Material changes will be notified via email or
        in-app notice. The "Last updated" date below indicates when this policy was most recently
        revised.
      </p>
    ),
  },
  {
    id: "contact",
    title: "11. Contact Us",
    body: (
      <p>
        For any question about refunds, cancellations, or this policy, contact us at{" "}
        <a className="text-primary underline" href="mailto:support@efin.money">support@efin.money</a>.
      </p>
    ),
  },
];

export default function RefundPolicyPage() {
  const lastUpdated = "July 24, 2026";

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
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Refund, Return &amp; Cancellation Policy</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          When transfers can be cancelled, how refunds work, and the fees that may apply.
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
