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
  { icon: Globe, title: "50+ Currency Corridors", desc: "Hold USD, CAD, NGN, KES, GHS and more in one app." },
];

const STEPS = [
  { n: 1, title: "Create your account", desc: "Sign up in under 2 minutes — no paperwork required." },
  { n: 2, title: "Add funds via card or bank", desc: "Top up instantly with your debit card or linked bank." },
  { n: 3, title: "Send money anywhere in Africa", desc: "Mobile money, bank deposit, or wallet — your choice." },
];

const STATS = [
  { value: 2, suffix: "M+", prefix: "$", label: "Transferred" },
  { value: 10000, suffix: "+", prefix: "", label: "Users" },
  { value: 50, suffix: "+", prefix: "", label: "Countries" },
  { value: 4.9, suffix: "★", prefix: "", label: "Rating", decimals: 1 },
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
  <div className="h-full p-5 flex flex-col bg-gradient-to-b from-emerald-50 to-white">
    <div className="text-xs text-neutral-500 mt-4">Total Balance</div>
    <div className="text-3xl font-black text-neutral-900 mt-1">$10,963.68</div>
    <div className="text-xs text-emerald-600 mt-1 font-semibold">+2.4% today</div>
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
    <div className="text-2xl font-black text-emerald-600 mt-1">₦387,500</div>
    <div className="mt-auto">
      <div className="rounded-xl bg-emerald-500 text-white text-sm font-bold py-3 text-center">
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
    <div className="my-2 mx-auto w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white">
      ↓
    </div>
    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
      <div className="text-xs text-emerald-700">To</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-lg font-bold text-neutral-900">🇨🇦 CAD</span>
        <span className="text-lg font-black text-emerald-700">136.42</span>
      </div>
    </div>
    <div className="mt-4 text-xs text-neutral-500">Live rate: 1 USD = 1.3642 CAD</div>
    <div className="mt-auto">
      <div className="rounded-xl bg-emerald-500 text-white text-sm font-bold py-3 text-center">
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
  return <div ref={ref} className="text-4xl md:text-5xl font-black text-neutral-900">{prefix}{display}{suffix}</div>;
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
      {/* ============ NAVBAR ============ */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-neutral-100">
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-9 h-9" />
            <Wordmark className="font-black text-xl tracking-tight" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-semibold text-neutral-900 hover:text-emerald-600 transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link to="/auth" className="text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-full transition-all hover:-translate-y-0.5 shadow-sm">
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-12 md:pt-24 md:pb-20 text-center">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] text-neutral-900">
            {HERO_WORDS.map((w, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.6, ease: "easeOut" }}
                className="inline-block mr-3"
              >
                {i >= 3 ? <span className="text-emerald-500">{w}</span> : w}
              </motion.span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="mt-8 max-w-2xl mx-auto text-lg md:text-xl text-neutral-600"
          >
            Multi-currency wallets, FX trading, crypto, and mobile money transfers to Africa.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link to="/auth" className="group inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:-translate-y-0.5 shadow-lg shadow-emerald-500/20">
              Get Started <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/auth" className="inline-flex items-center gap-2 border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white font-bold px-8 py-4 rounded-full text-base transition-all">
              Sign in
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="mt-6 inline-flex items-center gap-2 text-sm text-neutral-500"
          >
            <Globe className="w-4 h-4" />
            Available on Web · iOS & Android coming soon
          </motion.div>
        </div>

        {/* Phone mockups */}
        <div className="relative max-w-7xl mx-auto px-6 pb-24">
          <div className="flex items-end justify-center gap-2 sm:gap-6 flex-wrap">
            <div className="hidden sm:block"><PhoneFrame delay={0.2} rotate={-6}><WalletScreen /></PhoneFrame></div>
            <PhoneFrame delay={0.4}><SendScreen /></PhoneFrame>
            <div className="hidden sm:block"><PhoneFrame delay={0.6} rotate={6}><ExchangeScreen /></PhoneFrame></div>
          </div>
          {/* soft glow */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
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
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900">
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
                className="p-8 rounded-3xl bg-[#F7F7F7] hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all border border-transparent hover:border-neutral-100"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-3xl mb-6">
                  {f.emoji}
                </div>
                <h3 className="text-xl font-black text-neutral-900 mb-3">{f.title}</h3>
                <p className="text-neutral-600 leading-relaxed">{f.desc}</p>
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
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500 text-white text-2xl font-black flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                  {s.n}
                </div>
                <h3 className="text-xl font-black text-neutral-900 mb-3">{s.title}</h3>
                <p className="text-neutral-600">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ STATS ============ */}
      <section id="trust" className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <Counter to={s.value} decimals={s.decimals ?? 0} prefix={s.prefix} suffix={s.suffix} />
                <div className="mt-2 text-sm font-medium text-neutral-500 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* ============ FOOTER ============ */}
      <footer className="bg-neutral-900 text-neutral-400">
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="flex items-center gap-2">
              <Logo className="w-9 h-9" />
              <Wordmark className="font-black text-xl" />
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              {[
                { label: "About", href: "#" },
                { label: "Security", href: "#" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "#" },
                { label: "Contact", href: "mailto:info@efintax.biz" },
              ].map((l) => (
                l.href.startsWith("/") ? (
                  <Link key={l.label} to={l.href} className="hover:text-white transition-colors">{l.label}</Link>
                ) : (
                  <a key={l.label} href={l.href} className="hover:text-white transition-colors">{l.label}</a>
                )
              ))}
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-neutral-800 flex flex-col md:flex-row justify-between gap-3 text-xs">
            <span>© {new Date().getFullYear()} eFinMoney. All rights reserved.</span>
            <span>Licensed Money Services Business</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
