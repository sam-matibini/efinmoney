import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, UserPlus, ShieldCheck, Wallet, Send, CheckCircle2, LinkIcon, Building2 } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const STEPS = [
  {
    icon: UserPlus,
    title: "Create your account",
    desc: "Sign up in minutes with your email. No paperwork, no branch visit.",
  },
  {
    icon: ShieldCheck,
    title: "Verify your identity",
    desc: "Complete a quick identity check (KYC) with Persona, Interac, or by uploading documents for staff review. This keeps your money safe and is required before you can send.",
  },
  {
    icon: Wallet,
    title: "Add funds",
    desc: "Top up your wallet with a debit/credit card, bank transfer (EFT) or Interac e-Transfer in Canada. Your balance is ready to send instantly.",
  },
  {
    icon: Send,
    title: "Choose recipient & confirm",
    desc: "Pick the destination country, enter a bank account or mobile-money number, and see the live exchange rate and fees before you confirm — no surprises.",
  },
  {
    icon: CheckCircle2,
    title: "Money arrives",
    desc: "Funds settle to the recipient's bank account or mobile wallet — usually in minutes. Track the transfer live and get a receipt for every payment.",
  },
];

export default function HowItWorks() {
  useEffect(() => {
    document.title = "How it works — eFinMoney";
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <MarketingHeader variant="solid" />

      {/* Hero */}
      <section className="relative bg-grid-purple text-white overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[hsl(var(--brand-500)/0.35)] blur-[140px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]"
          >
            Sending money, <span className="text-[hsl(var(--accent-amber))]">simplified</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="mt-6 text-base md:text-lg text-white/70 max-w-2xl mx-auto"
          >
            From sign-up to money in hand — here's exactly how eFinMoney works, step by step.
          </motion.p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Steps — vertical timeline */}
      <section className="bg-white py-20 md:py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="relative">
            {/* connecting line */}
            <div className="absolute left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-[hsl(var(--accent-amber))]/60 via-neutral-200 to-transparent md:left-[31px]" />
            <div className="space-y-10">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="relative flex gap-5"
                >
                  <div className="relative z-10 flex-shrink-0 w-14 h-14 rounded-2xl bg-[hsl(var(--brand-900))] text-[hsl(var(--accent-amber))] flex items-center justify-center shadow-lg">
                    <s.icon className="w-6 h-6" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] text-xs font-black flex items-center justify-center ring-2 ring-white">
                      {i + 1}
                    </span>
                  </div>
                  <div className="pt-1.5">
                    <h3 className="text-xl font-bold text-[hsl(var(--brand-900))]">{s.title}</h3>
                    <p className="mt-2 text-[15px] text-neutral-600 leading-relaxed">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Receiving & Business */}
      <section className="bg-[hsl(var(--accent))]/30 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl bg-white border border-neutral-200/80 p-8">
            <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center mb-5">
              <LinkIcon className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--brand-900))] mb-2">Receiving money</h3>
            <p className="text-[15px] text-neutral-600 leading-relaxed">
              Share a payment link or your account details, and funds land straight in your wallet. From there,
              hold the balance, exchange it to another currency, or withdraw — it's yours instantly.
            </p>
          </div>
          <div className="rounded-3xl bg-white border border-neutral-200/80 p-8">
            <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--brand-900))] text-white flex items-center justify-center mb-5">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--brand-900))] mb-2">For businesses</h3>
            <p className="text-[15px] text-neutral-600 leading-relaxed">
              Onboard your organisation with a manual KYB document review (not Persona or Interac), fund your treasury, and run bulk payouts to suppliers and staff with
              approval controls — then reconcile every movement with a full audit trail and receipts.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-grid-purple text-white py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">Start your first transfer today</h2>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth" className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber">
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/features" className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/15 text-white font-bold px-7 py-3.5 rounded-full transition-all hover:bg-white/15">
              Explore features
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
