import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Wallet, Send, Smartphone, Repeat, Globe, Shield, Zap, Receipt, CreditCard,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { CurrencyFlag } from "@/components/ui/FlagImage";

const FEATURES = [
  {
    id: "wallets",
    icon: Wallet,
    title: "Multi-currency wallets",
    desc: "Hold NGN, GHS, USD, EUR, GBP and more in one account. Switch balances instantly.",
    accent: "from-violet-500/20 to-indigo-500/5",
  },
  {
    id: "send",
    icon: Send,
    title: "International transfers",
    desc: "Send to bank accounts and mobile money across supported corridors — with receipts and live tracking.",
    accent: "from-amber-400/25 to-orange-500/5",
    featured: true,
  },
  {
    id: "mobile-money",
    icon: Smartphone,
    title: "Mobile money",
    desc: "Pay into mobile money wallets with just a phone number.",
    accent: "from-emerald-500/20 to-teal-500/5",
  },
  {
    id: "exchange",
    icon: Repeat,
    title: "Currency exchange",
    desc: "Convert between currencies you hold at transparent, live market rates.",
    accent: "from-sky-500/20 to-blue-500/5",
  },
  {
    id: "receive",
    icon: Globe,
    title: "Receive & bank link",
    desc: "Get account details to receive money. Link external banks with Plaid.",
    accent: "from-fuchsia-500/15 to-pink-500/5",
  },
  {
    id: "cards",
    icon: CreditCard,
    title: "Virtual cards",
    desc: "Issue virtual cards, top them up from your wallet, freeze or unfreeze anytime.",
    accent: "from-rose-500/15 to-orange-500/5",
  },
  {
    id: "bills",
    icon: Receipt,
    title: "Airtime & bills",
    desc: "Buy airtime and pay bills from your wallet balance in supported countries.",
    accent: "from-lime-500/15 to-emerald-500/5",
  },
];

const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "NGN", "GHS", "KES", "UGX", "TZS", "ZMW", "ZAR", "RWF"];

const FLOW = [
  { icon: Wallet, title: "Hold", text: "Keep balances in the currencies you need." },
  { icon: Zap, title: "Move", text: "Transfer to banks or mobile money in minutes." },
  { icon: Receipt, title: "Track", text: "Receipts and status updates on every send." },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export default function Features() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Features — eFinMoney";
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.hash]);

  const featured = FEATURES.find((f) => f.featured)!;
  const rest = FEATURES.filter((f) => !f.featured);

  return (
    <div className="min-h-screen bg-[hsl(var(--brand-900))] text-white font-sans">
      <MarketingHeader variant="solid" />

      {/* Hero — one composition */}
      <section className="relative overflow-hidden bg-grid-purple">
        <div className="absolute -top-40 -right-20 w-[520px] h-[520px] rounded-full bg-[hsl(var(--accent-amber)/0.2)] blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-[420px] h-[420px] rounded-full bg-[hsl(var(--brand-500)/0.35)] blur-[100px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--accent-amber))] mb-5">
              eFinMoney features
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05]">
              Everything you need to{" "}
              <span className="text-[hsl(var(--accent-amber))]">move money</span>
              {" "}globally.
            </h1>
            <p className="mt-6 text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
              Multi-currency wallets, live FX, international transfers, and mobile money — built into one account.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber"
              >
                Get Started <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/15 text-white font-semibold px-7 py-3.5 rounded-full hover:bg-white/15 transition-colors"
              >
                See how it works
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.55 }}
            className="mt-14 flex flex-wrap gap-2"
          >
            {CURRENCIES.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-bold tracking-wide bg-white/10 border border-white/10 text-white/90 transition-colors hover:bg-white/[0.16] hover:border-white/20"
              >
                <CurrencyFlag code={c} size="sm" className="ring-white/25" />
                {c}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Featured transfer strip */}
      <section className="relative bg-[hsl(48_40%_96%)] text-neutral-900">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
          <motion.div
            id={featured.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55 }}
            className="scroll-mt-24 relative overflow-hidden rounded-[2rem] bg-[hsl(var(--brand-900))] text-white p-8 md:p-12"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--accent-amber)/0.25)] via-transparent to-[hsl(var(--brand-500)/0.4)] pointer-events-none" />
            <div className="relative grid md:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-[hsl(var(--accent-amber))] text-xs font-semibold uppercase tracking-wider mb-4">
                  <featured.icon className="w-4 h-4" />
                  Core product
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight">{featured.title}</h2>
                <p className="mt-4 text-white/70 text-base md:text-lg leading-relaxed max-w-lg">
                  {featured.desc}
                </p>
                <Link
                  to="/auth"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent-amber))] hover:gap-3 transition-all"
                >
                  Start a transfer <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Shield, label: "Bank-grade security" },
                  { icon: Zap, label: "Minutes, not days" },
                  { icon: Receipt, label: "Live tracking" },
                  { icon: Globe, label: "Multi-corridor" },
                ].map((b) => (
                  <div
                    key={b.label}
                    className="rounded-2xl bg-white/10 border border-white/10 p-4 backdrop-blur-sm"
                  >
                    <b.icon className="w-5 h-5 text-[hsl(var(--accent-amber))] mb-3" />
                    <p className="text-sm font-semibold text-white/90">{b.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento feature grid */}
      <section className="bg-[hsl(48_40%_96%)] text-neutral-900 pb-20 md:pb-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-10 md:mb-14 max-w-xl">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Built into every account
            </h2>
            <p className="mt-3 text-neutral-600 leading-relaxed">
              Hold balances, exchange at live rates, and send or receive across borders — without juggling apps.
            </p>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="grid sm:grid-cols-2 gap-5"
          >
            {rest.map((f, i) => (
              <motion.div
                key={f.id}
                id={f.id}
                variants={item}
                className={`group scroll-mt-24 relative overflow-hidden rounded-[1.75rem] border border-neutral-200/80 bg-white p-7 md:p-8 ${
                  i === 0 ? "sm:col-span-2 md:grid md:grid-cols-[auto_1fr] md:gap-8 md:items-center" : ""
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${f.accent} opacity-80 pointer-events-none`} />
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--brand-900))] text-[hsl(var(--accent-amber))] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300">
                    <f.icon className="w-6 h-6" />
                  </div>
                </div>
                <div className="relative">
                  <h3 className="text-xl font-bold text-[hsl(var(--brand-900))] mb-2">{f.title}</h3>
                  <p className="text-[15px] text-neutral-600 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Flow */}
      <section className="relative bg-grid-purple overflow-hidden py-20 md:py-24">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-[hsl(var(--accent-amber)/0.12)] blur-[100px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6">
          <h2 className="text-center text-3xl md:text-4xl font-black tracking-tight mb-12">
            Hold. Move. Track.
          </h2>
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-6"
          >
            {FLOW.map((step, idx) => (
              <motion.div
                key={step.title}
                variants={item}
                className="relative text-center md:text-left p-6"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] mb-5">
                  <step.icon className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                  Step {idx + 1}
                </p>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-white/65 text-sm leading-relaxed">{step.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[hsl(48_40%_96%)] py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))]">
            Ready when you are
          </h2>
          <p className="mt-4 text-neutral-600">Create your account in minutes.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center justify-center gap-2 bg-white border border-neutral-200 text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full hover:border-neutral-300 transition-colors"
            >
              About eFinMoney
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
