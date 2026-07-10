import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Target, Globe, ShieldCheck, Zap, Eye, Mail } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { CountryFlag } from "@/components/ui/FlagImage";

const VALUES = [
  { icon: ShieldCheck, t: "Security first", d: "Bank-grade encryption, multi-factor authentication, and regulated MSB operations with a SOC 2 Type II posture." },
  { icon: Eye, t: "Radical transparency", d: "Live exchange rates and clear fees shown before you confirm — with a receipt on every transaction." },
  { icon: Zap, t: "Speed that matters", d: "Transfers that settle in minutes, not days, so the people who depend on you don't wait." },
];

const CORRIDORS = [
  { country: "Canada", label: "Canada" },
  { country: "United States", label: "USA" },
  { country: "Nigeria", label: "Nigeria" },
  { country: "Kenya", label: "Kenya" },
  { country: "Ghana", label: "Ghana" },
  { country: "Zambia", label: "Zambia" },
];

export default function About() {
  useEffect(() => {
    document.title = "About — eFinMoney";
  }, []);

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
            About eFinMoney
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]"
          >
            Connecting <span className="text-[hsl(var(--accent-amber))]">North America and Africa</span>, one transfer at a time.
          </motion.h1>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Mission */}
      <section className="bg-white py-20 md:py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center mb-6">
            <Target className="w-7 h-7" />
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))]">Our mission</h2>
          <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
            Moving money across borders should be as simple as sending a message. eFinMoney gives individuals and
            businesses one account to hold multiple currencies and send funds between North America and Africa —
            reaching bank accounts and mobile wallets directly, quickly and affordably.
          </p>
        </div>
      </section>

      {/* Corridors */}
      <section className="bg-[hsl(var(--accent))]/30 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))]">
            <Globe className="w-3 h-3" /> Corridors we serve
          </span>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {CORRIDORS.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full bg-white text-[hsl(var(--brand-900))] shadow-sm border border-neutral-200/80">
                <CountryFlag country={c.country} size="md" /> {c.label}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm text-neutral-600">
            With direct mobile-money payouts via MTN, Airtel, M-Pesa and Vodafone.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-[hsl(var(--brand-900))] text-center mb-14">
            What we stand for
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {VALUES.map((v) => (
              <div key={v.t} className="rounded-3xl bg-white border border-neutral-200/80 p-8">
                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--brand-900))] text-[hsl(var(--accent-amber))] flex items-center justify-center mb-5">
                  <v.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[hsl(var(--brand-900))] mb-2">{v.t}</h3>
                <p className="text-[15px] text-neutral-600 leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-grid-purple text-white py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-6">
            <Mail className="w-7 h-7 text-[hsl(var(--accent-amber))]" />
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">Get in touch</h2>
          <p className="mt-4 text-white/70">
            Questions, partnerships or support — we'd love to hear from you.
          </p>
          <a href="mailto:support@efin.money" className="mt-8 inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber">
            support@efin.money
          </a>
          <div className="mt-6">
            <Link to="/auth" className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold">
              Or create your account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
