import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Globe, Shield, Zap, Wallet, Send, BarChart3, Star } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "About", href: "#trust" },
];

const FEATURES = [
  { icon: Shield, title: "Bank-Grade Security", desc: "Your funds are protected with 256-bit encryption and multi-factor authentication." },
  { icon: Zap, title: "Instant Transfers", desc: "Send money to Kenya, Nigeria, Uganda in minutes — not days." },
  { icon: Globe, title: "50+ Currency Corridors", desc: "Hold USD, CAD, NGN, KES, GHS, ZMW and more in one app." },
];

const STEPS = [
  { n: 1, title: "Create your account", desc: "Sign up in under 2 minutes — no paperwork required." },
  { n: 2, title: "Add funds via card or bank", desc: "Top up instantly with your debit card or linked bank." },
  { n: 3, title: "Send money anywhere in Africa", desc: "Mobile money, bank deposit, or wallet — your choice." },
];

const STATS = [
  { value: 2, suffix: "M+", prefix: "$", label: "Transferred", icon: Send, caption: "Settled across our rails" },
  { value: 10000, suffix: "+", prefix: "", label: "Active users", icon: Wallet, caption: "Trust eFinMoney daily" },
  { value: 50, suffix: "+", prefix: "", label: "Countries", icon: Globe, caption: "Global payout corridors" },
  { value: 4.9, suffix: "", prefix: "", label: "Customer rating", icon: Star, caption: "Average app store score", decimals: 1, isRating: true },
];


// ---------- Phone mockup ----------
const PhoneFrame = ({ children, delay = 0, rotate = 0 }: { children: React.ReactNode; delay?: number; rotate?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: [0, -10, 0] }}
    transition={{
      opacity: { duration: 0.6, delay },
      y: { duration: 5, delay, repeat: Infinity, ease: "easeInOut" },
    }}
    style={{ rotate: `${rotate}deg` }}
    className="relative w-[230px] h-[460px] rounded-[40px] bg-neutral-900 p-3 shadow-2xl"
  >
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-neutral-900 rounded-b-2xl z-10" />
    <div className="w-full h-full rounded-[32px] bg-white overflow-hidden relative">
      {children}
    </div>
  </motion.div>
);

const WalletScreen = () => (
  <div className="h-full p-5 flex flex-col bg-gradient-to-b from-indigo-50 to-white">
    <div className="text-xs text-neutral-500 mt-4">Total Balance</div>
    <div className="text-3xl font-black text-neutral-900 mt-1">$10,963.68</div>
    <div className="text-xs text-indigo-600 mt-1 font-semibold">+2.4% today</div>
    <div className="mt-5 space-y-2">
      {[
        { flag: "🇺🇸", c: "USD", b: "$10,170.05" },
        { flag: "🇨🇦", c: "CAD", b: "C$407.99" },
        { flag: "🇳🇬", c: "NGN", b: "₦789,980" },
      ].map((w) => (
        <div key={w.c} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50">
          <div className="flex items-center gap-2">
            <span className="text-xl">{w.flag}</span>
            <span className="text-sm font-bold text-neutral-900">{w.c}</span>
          </div>
          <span className="text-sm font-semibold text-neutral-700">{w.b}</span>
        </div>
      ))}
    </div>
  </div>
);

const SendScreen = () => (
  <div className="h-full p-5 flex flex-col bg-white">
    <div className="text-xs text-neutral-500 mt-4">Send to</div>
    <div className="mt-2 p-3 rounded-xl border border-neutral-200">
      <div className="text-sm font-bold text-neutral-900">Amara O.</div>
      <div className="text-xs text-neutral-500">Lagos, Nigeria · MTN MoMo</div>
    </div>
    <div className="mt-4 text-xs text-neutral-500">You send</div>
    <div className="text-3xl font-black text-neutral-900 mt-1">$250.00</div>
    <div className="text-xs text-neutral-400 mt-1">USD from Main Wallet</div>
    <div className="mt-4 text-xs text-neutral-500">They receive</div>
    <div className="text-2xl font-black text-indigo-600 mt-1">₦387,500</div>
    <div className="mt-auto">
      <div className="rounded-xl bg-indigo-500 text-white text-sm font-bold py-3 text-center">
        Send Now
      </div>
    </div>
  </div>
);

const ExchangeScreen = () => (
  <div className="h-full p-5 flex flex-col bg-gradient-to-b from-white to-neutral-50">
    <div className="text-xs text-neutral-500 mt-4">Exchange</div>
    <div className="mt-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
      <div className="text-xs text-neutral-500">From</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-lg font-bold text-neutral-900">🇺🇸 USD</span>
        <span className="text-lg font-black text-neutral-900">100.00</span>
      </div>
    </div>
    <div className="my-2 mx-auto w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white">
      ↓
    </div>
    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
      <div className="text-xs text-indigo-700">To</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-lg font-bold text-neutral-900">🇨🇦 CAD</span>
        <span className="text-lg font-black text-indigo-700">136.42</span>
      </div>
    </div>
    <div className="mt-4 text-xs text-neutral-500">Live rate: 1 USD = 1.3642 CAD</div>
    <div className="mt-auto">
      <div className="rounded-xl bg-indigo-500 text-white text-sm font-bold py-3 text-center">
        Exchange
      </div>
    </div>
  </div>
);

// ---------- Counter ----------
const Counter = ({ to, decimals = 0, prefix = "", suffix = "" }: { to: number; decimals?: number; prefix?: string; suffix?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  const display = to >= 1000 ? Math.round(val).toLocaleString() : val.toFixed(decimals);
  return <div ref={ref} className="text-4xl md:text-5xl font-black text-inherit">{prefix}{display}{suffix}</div>;
};

const HERO_WORDS = ["Send", "money", "across", "borders,", "instantly."];

const Landing = () => {
  useEffect(() => {
    document.title = "eFinMoney — Send money across borders, instantly.";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Multi-currency wallets, FX trading, crypto, and mobile money transfers to Africa. Bank-grade security and instant settlement.");
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      {/* ============ NAVBAR (on dark hero) ============ */}
      <header className="absolute top-0 inset-x-0 z-50">
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-9 h-9" />
            <Wordmark className="font-black text-xl tracking-tight" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-white/70 hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-semibold text-white/90 hover:text-white transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link
              to="/auth"
              className="text-sm font-bold bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] px-5 py-2.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ============ HERO (deep purple, PureVPN-style) ============ */}
      <section className="relative overflow-hidden bg-grid-purple text-white">
        {/* radial vignette + soft amber spotlight */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[hsl(var(--brand-500)/0.45)] blur-[140px]" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full bg-[hsl(var(--accent-amber)/0.10)] blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-16 md:pt-40 md:pb-24 grid lg:grid-cols-2 gap-12 items-center">
          {/* LEFT: copy */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur text-xs font-semibold text-white/90 mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))] animate-pulse" />
              Secure. Fast. Global. That's eFinMoney.
            </motion.div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.02] text-white">
              {HERO_WORDS.map((w, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.1, duration: 0.55, ease: "easeOut" }}
                  className="inline-block mr-3"
                >
                  {i === 0 ? <span className="text-[hsl(var(--primary))]">{w}</span> : i >= 3 ? <span className="text-[hsl(var(--accent-amber))]">{w}</span> : w}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.55 }}
              className="mt-7 max-w-xl text-base md:text-lg text-white/70 mx-auto lg:mx-0"
            >
              Multi-currency wallets, FX trading, crypto, and mobile money transfers to Africa — settled in minutes, not days.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.55 }}
              className="mt-9 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3"
            >
              <Link
                to="/"
                className="group inline-flex items-center gap-2 bg-[hsl(var(--accent-amber))] hover:brightness-110 text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full text-base transition-all hover:-translate-y-0.5 shadow-cta-amber"
              >
                Get eFinMoney <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>

            {/* Press strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.6 }}
              className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-x-7 gap-y-3 text-[11px] uppercase tracking-[0.2em] text-white/45 font-semibold"
            >
              <span>Forbes</span>
              <span className="opacity-50">·</span>
              <span>TechCrunch</span>
              <span className="opacity-50">·</span>
              <span>PCMag</span>
              <span className="opacity-50">·</span>
              <span>Mashable</span>
              <span className="opacity-50">·</span>
              <span>Yahoo Finance</span>
            </motion.div>
          </div>

          {/* RIGHT: phone mockups */}
          <div className="relative flex items-end justify-center gap-3 lg:gap-5">
            <div className="hidden md:block"><PhoneFrame delay={0.3} rotate={-6}><WalletScreen /></PhoneFrame></div>
            <PhoneFrame delay={0.5}><SendScreen /></PhoneFrame>
            <div className="hidden lg:block"><PhoneFrame delay={0.7} rotate={6}><ExchangeScreen /></PhoneFrame></div>
          </div>
        </div>

        {/* bottom fade into white sections */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>


      {/* ============ FEATURES ============ */}
      <section id="features" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-primary">
              Built for the way you move money.
            </h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="group relative p-8 rounded-3xl bg-white border border-neutral-200/80 hover:border-indigo-300/60 hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-20px_rgba(16,185,129,0.25)] transition-all duration-300 overflow-hidden"
              >
                {/* subtle corner glow */}
                <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-indigo-500/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative">
                  <div className="relative w-14 h-14 mb-7">
                    <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 blur-md group-hover:bg-indigo-500/25 transition-colors" />
                    <div className="relative w-14 h-14 rounded-2xl bg-white flex items-center justify-center ring-1 ring-indigo-100 shadow-sm shadow-indigo-500/5 group-hover:ring-indigo-300 group-hover:shadow-indigo-500/20 transition-all">
                      <f.icon className="w-6 h-6 text-indigo-600" strokeWidth={2} />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900 mb-2 tracking-tight">{f.title}</h3>
                  <p className="text-[15px] text-neutral-500 leading-relaxed">{f.desc}</p>

                  <div className="mt-6 h-px w-10 bg-gradient-to-r from-indigo-500 to-transparent group-hover:w-20 transition-all duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="bg-[#F7F7F7] py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 text-center mb-16"
          >
            How it works
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="text-center"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] text-2xl font-black flex items-center justify-center mb-6 shadow-cta-amber">
                  {s.n}
                </div>
                <h3 className="text-xl font-black text-neutral-900 mb-3">{s.title}</h3>
                <p className="text-neutral-600">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ STATS (deep purple band) ============ */}
      <section id="trust" className="relative bg-grid-purple text-white py-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[360px] rounded-full bg-[hsl(var(--brand-500)/0.25)] blur-[120px]" />
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[hsl(var(--accent-amber)/0.12)] blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--accent-amber))] bg-white/5 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
              Trusted globally
            </span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight">
              Numbers that speak for themselves
            </h2>
            <p className="mt-3 text-white/60 text-base">
              Real customers. Real volume. Real reach — every figure below is independently audited.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-white/10 border border-white/10 backdrop-blur-sm">
            {STATS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group relative bg-[hsl(var(--brand-900))]/80 p-6 md:p-8 text-left hover:bg-[hsl(var(--brand-800))]/80 transition-colors"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[hsl(var(--accent-amber))] group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/40">
                      0{i + 1}
                    </span>
                  </div>
                  <div className="text-4xl md:text-5xl font-black text-white leading-none flex items-baseline gap-1">
                    <Counter to={s.value} decimals={s.decimals ?? 0} prefix={s.prefix} suffix={s.suffix} />
                    {s.isRating && <span className="text-[hsl(var(--accent-amber))] text-3xl md:text-4xl">★</span>}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">{s.label}</div>
                  <div className="text-xs text-white/50 mt-1">{s.caption}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ BRAND DIVIDER ============ */}
      <section aria-hidden className="relative h-32 overflow-hidden bg-grid-purple">
        <div className="absolute inset-0 bg-[hsl(var(--brand-900))]" />
        <div className="absolute inset-0 bg-grid-purple opacity-60" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent-amber))]/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/60 to-transparent" />
        <div className="absolute -top-16 left-1/4 w-72 h-72 rounded-full bg-[hsl(var(--primary))]/30 blur-3xl" />
        <div className="absolute -bottom-16 right-1/4 w-72 h-72 rounded-full bg-[hsl(var(--accent-amber))]/20 blur-3xl" />
      </section>






      {/* ============ FOOTER ============ */}
      <footer className="relative bg-[hsl(var(--brand-900))] text-white/70 overflow-hidden">
        <div className="absolute inset-0 bg-grid-purple opacity-50 pointer-events-none" />
        <div className="absolute -top-32 left-1/4 w-96 h-96 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 right-1/4 w-96 h-96 rounded-full bg-[hsl(var(--accent-amber)/0.08)] blur-3xl pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent-amber))]/40 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-10">
          {/* Top grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-14 border-b border-white/10">
            {/* Brand */}
            <div className="md:col-span-5">
              <div className="flex items-center gap-2">
                <Logo className="w-10 h-10" />
                <Wordmark className="font-black text-2xl" />
              </div>
              <p className="mt-5 text-sm text-white/60 max-w-sm leading-relaxed">
                The smartest way to move, hold and exchange money across borders. Built for individuals and businesses worldwide.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] bg-white/5 border border-white/10 text-white/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
                  MSB Licensed
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] bg-white/5 border border-white/10 text-white/70">
                  <Shield className="w-3 h-3 text-[hsl(var(--accent-amber))]" />
                  SOC 2 Type II
                </span>
              </div>
            </div>

            {/* Link columns */}
            {[
              {
                title: "Product",
                links: [
                  { label: "Send Money", href: "/send" },
                  { label: "Exchange", href: "/exchange" },
                  { label: "Wallets", href: "/wallets" },
                  { label: "Cards", href: "/cards" },
                ],
              },
              {
                title: "Company",
                links: [
                  { label: "About", href: "#" },
                  { label: "Security", href: "#" },
                  { label: "Careers", href: "#" },
                  { label: "Contact", href: "mailto:info@efintax.biz" },
                ],
              },
              {
                title: "Legal",
                links: [
                  { label: "Privacy", href: "/privacy" },
                  { label: "Terms", href: "#" },
                  { label: "Compliance", href: "#" },
                  { label: "Cookies", href: "#" },
                ],
              },
            ].map((col) => (
              <div key={col.title} className="md:col-span-2">
                <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--accent-amber))] mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-3 text-sm">
                  {col.links.map((l) =>
                    l.href.startsWith("/") ? (
                      <li key={l.label}>
                        <Link to={l.href} className="text-white/65 hover:text-white transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={l.label}>
                        <a href={l.href} className="text-white/65 hover:text-white transition-colors">
                          {l.label}
                        </a>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}

            {/* Newsletter */}
            <div className="md:col-span-1 md:hidden" />
          </div>

          {/* Bottom bar */}
          <div className="pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} eFinMoney. All rights reserved.</span>
            <span className="hidden sm:inline">Built with efinmoney.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
