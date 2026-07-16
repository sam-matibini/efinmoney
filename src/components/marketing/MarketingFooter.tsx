import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Mail, Shield, Sparkles } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";

const CORRIDOR_TICKER = [
  "🇨🇦 CAD", "🇺🇸 USD", "🇳🇬 NGN", "🇰🇪 KES", "🇬🇭 GHS", "🇿🇲 ZMW", "🇺🇬 UGX", "🇹🇿 TZS",
  "🇨🇦 CAD", "🇺🇸 USD", "🇳🇬 NGN", "🇰🇪 KES", "🇬🇭 GHS", "🇿🇲 ZMW", "🇺🇬 UGX", "🇹🇿 TZS",
];

const NAV_PILLS: { label: string; href: string; external?: boolean }[] = [
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Compliance", href: "/compliance" },
  { label: "Contact", href: "/contact" },
];

const spring = { type: "spring" as const, stiffness: 380, damping: 28 };

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative bg-[hsl(var(--brand-900))] text-white overflow-hidden">
      {/* Ambient layers */}
      <div className="absolute inset-0 bg-grid-purple opacity-40 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(100%,56rem)] h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent-amber))]/50 to-transparent" />
      <div className="absolute -top-24 right-0 w-80 h-80 rounded-full bg-[hsl(var(--primary)/0.2)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-[hsl(var(--accent-amber)/0.07)] blur-3xl pointer-events-none" />

      {/* Corridor marquee — not a link column */}
      <div className="relative border-b border-white/10 overflow-hidden py-3.5 footer-marquee-mask">
        <div className="flex w-max footer-marquee-track gap-10 text-sm font-medium tracking-wide text-white/45">
          {CORRIDOR_TICKER.map((item, i) => (
            <span key={`${item}-${i}`} className="inline-flex items-center gap-2 shrink-0">
              <span className="text-white/25">◆</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-5 sm:px-6 py-14 sm:py-16">
        {/* Giant watermark */}
        <p
          aria-hidden
          className="pointer-events-none select-none absolute -top-4 left-1/2 -translate-x-1/2 text-[clamp(3.5rem,14vw,9rem)] font-black leading-none tracking-tighter text-white/[0.03] whitespace-nowrap"
        >
          eFinMoney
        </p>

        {/* Bento grid — asymmetric, not 4 equal columns */}
        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Primary CTA tile */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={spring}
            className="lg:col-span-7 rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6 sm:p-8 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <Logo static className="w-9 h-9 sm:w-10 sm:h-10" />
              <Wordmark subtle className="font-black text-xl sm:text-2xl" />
            </div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--accent-amber))] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Cross-border, simplified
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight max-w-lg">
              Move money across borders without the banking friction.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-white/55 max-w-md leading-relaxed">
              Wallets, transfers, exchange, and cards — built for people who live in more than one currency.
            </p>
            <Link
              to="/auth"
              className="group mt-6 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--accent-amber))] px-5 py-2.5 text-sm font-bold text-[hsl(var(--brand-900))] shadow-[var(--shadow-cta-amber)] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
            >
              Get started free
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          {/* Side stack */}
          <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-5">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ ...spring, delay: 0.06 }}
              className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-4">Trust & compliance</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--accent-amber)/0.35)] bg-[hsl(var(--accent-amber)/0.08)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--accent-amber))]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))] animate-pulse" />
                  MSB Licensed
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75">
                  <Shield className="w-3.5 h-3.5 text-[hsl(var(--accent-amber))]" />
                  SOC 2 Type II
                </span>
              </div>
            </motion.div>

            <motion.a
              href="mailto:support@efin.money"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ ...spring, delay: 0.1 }}
              whileHover={{ y: -2 }}
              className="group rounded-2xl border border-white/10 bg-gradient-to-r from-[hsl(var(--primary)/0.15)] to-transparent p-5 sm:p-6 transition-colors hover:border-[hsl(var(--primary)/0.35)]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-2">Say hello</p>
              <span className="flex items-center gap-2 text-base sm:text-lg font-semibold text-white group-hover:text-[hsl(var(--accent-amber))] transition-colors">
                <Mail className="w-4 h-4 shrink-0" />
                support@efin.money
              </span>
            </motion.a>
          </div>
        </div>

        {/* Horizontal link rail — replaces Product / Company / Legal columns */}
        <motion.nav
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15, duration: 0.5 }}
          aria-label="Footer"
          className="relative mt-10 sm:mt-12 flex flex-wrap justify-center lg:justify-start gap-2 sm:gap-2.5"
        >
          {NAV_PILLS.map((pill) =>
            pill.external ? (
              <a
                key={pill.label}
                href={pill.href}
                className="footer-pill rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs sm:text-sm text-white/65 hover:text-white hover:border-white/25 hover:bg-white/[0.08] transition-all duration-300"
              >
                {pill.label}
              </a>
            ) : (
              <Link
                key={pill.label}
                to={pill.href}
                className="footer-pill rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs sm:text-sm text-white/65 hover:text-white hover:border-white/25 hover:bg-white/[0.08] transition-all duration-300"
              >
                {pill.label}
              </Link>
            ),
          )}
        </motion.nav>

        {/* Minimal closing line */}
        <div className="relative mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-white/35">
          <span>© {year} eFinMoney. All rights reserved.</span>
          <span className="text-white/25">Built for global money movement.</span>
        </div>
      </div>
    </footer>
  );
}
