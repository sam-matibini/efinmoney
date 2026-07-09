import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Wallet, Send, Smartphone, Repeat, CreditCard, Receipt,
  LinkIcon, Landmark, Building2, ShieldCheck, Globe,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const PERSONAL = [
  {
    id: "wallets",
    icon: Wallet,
    title: "Multi-currency wallets",
    desc: "Hold and manage USD, CAD, NGN, KES, GHS and ZMW side by side in one account. Switch between balances instantly — no need for separate bank accounts per currency.",
  },
  {
    id: "send",
    icon: Send,
    title: "Cross-border transfers",
    desc: "Send money from Canada and the USA to recipients across Africa. Funds arrive to bank accounts or mobile wallets — settled in minutes, with a receipt and live tracking on every transfer.",
  },
  {
    id: "mobile-money",
    icon: Smartphone,
    title: "Mobile-money payouts",
    desc: "Pay directly into MTN, Airtel, M-Pesa and Vodafone wallets. Your recipient doesn't need a bank account — just their phone number.",
  },
  {
    id: "canada",
    icon: Landmark,
    title: "Canada rails & Interac",
    desc: "Fund your account and move money in Canada using Interac e-Transfer and bank (EFT) rails, alongside card top-ups.",
  },
  {
    id: "exchange",
    icon: Repeat,
    title: "Currency exchange",
    desc: "Convert between the currencies you hold at transparent, live market rates — right inside the app, before you send.",
  },
  {
    id: "cards",
    icon: CreditCard,
    title: "Cards",
    desc: "Spend from your balance and send funds to cards. Manage your eFinMoney card and card-based transfers in one place.",
  },
  {
    id: "bills",
    icon: Receipt,
    title: "Bill payments",
    desc: "Top up airtime and data and settle utility bills in Nigeria, plus bill pay in Canada — funded straight from your wallet.",
  },
  {
    id: "payment-links",
    icon: LinkIcon,
    title: "Payment links & requests",
    desc: "Create a shareable link to get paid. Recipients claim funds securely, even if they're new to eFinMoney.",
  },
  {
    id: "receive",
    icon: Globe,
    title: "Receive & virtual accounts",
    desc: "Get dedicated account details to receive money into your wallet, and track everything with a full transaction history.",
  },
];

const BUSINESS = [
  { icon: Send, t: "Bulk payouts & approvals", d: "Pay suppliers, contractors and staff across multiple corridors, with an approval flow." },
  { icon: Building2, t: "Multi-entity wallets", d: "Run separate balances per entity or currency under one organisation." },
  { icon: ShieldCheck, t: "Compliance & audit trail", d: "KYC/AML controls, full audit logging and receipts on every movement." },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Features() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Features — eFinMoney";
  }, []);

  // Jump to the section named in the URL hash (e.g. /features#mobile-money).
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <MarketingHeader variant="solid" />

      {/* Hero */}
      <section className="relative bg-grid-purple text-white overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[hsl(var(--brand-500)/0.35)] blur-[140px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
            Everything eFinMoney does
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]"
          >
            One account for <span className="text-[hsl(var(--accent-amber))]">every way</span> you move money.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-6 text-base md:text-lg text-white/70 max-w-2xl mx-auto"
          >
            Multi-currency wallets, instant cross-border transfers, mobile-money payouts, FX, cards and
            bill payments — built for the corridors between North America and Africa.
          </motion.p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Personal features grid */}
      <section className="bg-white py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))]">For individuals</span>
            <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Send, hold, exchange and pay
            </h2>
          </div>
          <motion.div
            variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {PERSONAL.map((f) => (
              <motion.div
                key={f.title} id={f.id} variants={item}
                className="group scroll-mt-24 rounded-3xl bg-white border border-neutral-200/80 p-7 hover:border-indigo-300/60 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(79,70,229,0.25)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--accent))] flex items-center justify-center text-[hsl(var(--brand-700))] mb-5 group-hover:scale-105 transition-transform">
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[hsl(var(--brand-900))] mb-2">{f.title}</h3>
                <p className="text-[15px] text-neutral-600 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Business band */}
      <section id="business" className="scroll-mt-24 bg-[hsl(var(--accent))]/30 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))]">
              <Building2 className="w-3 h-3" /> For business
            </span>
            <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Treasury, payouts and FX in one platform
            </h2>
            <p className="mt-4 text-[15px] md:text-base text-neutral-600 leading-relaxed">
              Pay across Africa and North America with the controls and reporting your finance team expects.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {BUSINESS.map((b) => (
              <div key={b.t} className="rounded-3xl bg-white border border-neutral-200/80 p-7">
                <div className="w-11 h-11 rounded-xl bg-[hsl(var(--brand-900))] text-white flex items-center justify-center mb-5">
                  <b.icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[hsl(var(--brand-900))] mb-2">{b.t}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-grid-purple text-white py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">Ready to move money the smarter way?</h2>
          <p className="mt-4 text-white/70">Create your account in minutes.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth" className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber">
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/how-it-works" className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/15 text-white font-bold px-7 py-3.5 rounded-full transition-all hover:bg-white/15">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
