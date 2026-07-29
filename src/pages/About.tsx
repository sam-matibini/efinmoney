import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Target, Globe, ShieldCheck, Zap, Eye, Mail } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const VALUES = [
  { icon: ShieldCheck, t: "Security first", d: "Bank-grade encryption, multi-factor authentication, and regulated MSB operations with a SOC 2 Type II posture." },
  { icon: Eye, t: "Radical transparency", d: "Live exchange rates and clear fees shown before you confirm — with a receipt on every transaction." },
  { icon: Zap, t: "Speed that matters", d: "Transfers that settle in minutes, not days, so the people who depend on you don't wait." },
];

// Real flag images (flagcdn) so every corridor renders across all platforms.
const CORRIDORS = [
  { cc: "ca", label: "Canada" },
  { cc: "us", label: "USA" },
  { cc: "gb", label: "United Kingdom" },
  { cc: "eu", label: "Europe" },
  { cc: "ng", label: "Nigeria" },
  { cc: "gh", label: "Ghana" },
  { cc: "ke", label: "Kenya" },
  { cc: "za", label: "South Africa" },
  { cc: "sn", label: "Senegal" },
  { cc: "ug", label: "Uganda" },
  { cc: "tz", label: "Tanzania" },
  { cc: "zm", label: "Zambia" },
];

function Flag({ cc, alt }: { cc: string; alt: string }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt={alt}
      loading="lazy"
      className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
    />
  );
}

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
            Connecting <span className="text-[hsl(var(--accent-amber))]">people and businesses worldwide</span>, one transfer at a time.
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
            businesses one account to hold multiple currencies and send funds worldwide — reaching bank accounts and
            mobile wallets across Africa, plus card payouts in the US, Europe and the UK, quickly and affordably.
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
              <span key={c.label} className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full bg-white text-[hsl(var(--brand-900))] shadow-sm border border-neutral-200/80 transition-transform hover:-translate-y-0.5">
                <Flag cc={c.cc} alt={c.label} /> {c.label}
              </span>
            ))}
            <span className="inline-flex items-center text-sm font-bold px-4 py-2 rounded-full bg-[hsl(var(--brand-900))] text-white shadow-sm">
              + 30 more African destinations
            </span>
          </div>
          <p className="mt-6 text-sm text-neutral-600">
            Card payouts in the US, Europe &amp; UK, plus direct mobile-money via MTN, Airtel, M-Pesa and Vodafone.
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
          <Link to="/contact" className="mt-8 inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber">
            Contact us
          </Link>
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
