import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Globe, Shield, Zap, Wallet, Send, BarChart3, Building2, Layers, Check } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { CountryFlag } from "@/components/ui/FlagImage";
import africaHero from "@/assets/landing-africa-hero.jpg";
import africaBand from "@/assets/landing-africa-band.jpg";
import b2bPhone from "@/assets/landing-b2b-phone.jpg";
import tourismKenya from "@/assets/landing-tourism-kenya.jpg";
import tourismVicFalls from "@/assets/landing-tourism-victoria-falls.jpg";
import tourismZanzibar from "@/assets/landing-tourism-zanzibar.jpg";
import featureSecurity from "@/assets/landing-feature-security.jpg";
import featureInstant from "@/assets/landing-feature-instant.jpg";
import featureCorridors from "@/assets/landing-feature-corridors.jpg";
import MarketTicker from "@/components/landing/MarketTicker";
import FxCalculator from "@/components/landing/FxCalculator";
import GlobalCorridors from "@/components/GlobalCorridors";
import senders from "@/assets/landing-senders.jpg";
import receivers from "@/assets/landing-receivers.jpg";

const FEATURES = [
  { icon: Shield, title: "Bank-Grade Security", desc: "Your funds are protected with 256-bit encryption and multi-factor authentication.", image: featureSecurity },
  { icon: Zap, title: "Instant Transfers", desc: "Send to Nigeria bank accounts and Ghana mobile money in minutes — not days.", image: featureInstant },
  { icon: Globe, title: "Multi-Currency Wallets", desc: "Hold NGN, GHS, USD, EUR, GBP and more — with live FX when you need to convert.", image: featureCorridors },
];

const STEPS: { n: number; title: string; desc?: string }[] = [
  { n: 1, title: "Create your account" },
  { n: 2, title: "Add funds via bank or card" },
  { n: 3, title: "Send to Nigeria or Ghana" },
];

const STATS = [
  { value: "2", label: "Live corridors", icon: Globe, caption: "Nigeria bank · Ghana MoMo" },
  { value: "6+", label: "Currencies to hold", icon: Wallet, caption: "NGN · GHS · USD · EUR · GBP · more" },
  { value: "Minutes", label: "Typical settlement", icon: Zap, caption: "Delivered fast — not in days" },
  { value: "24/7", label: "Send anytime", icon: Send, caption: "Every day of the year" },
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
    <div className="text-2xl font-black text-neutral-900 mt-1">$10,963.68</div>
    <div className="text-[10px] text-indigo-600 mt-1 font-semibold">+2.4% today</div>
    <div className="mt-3 space-y-1.5">
      {[
        { flag: "🇺🇸", c: "USD", b: "$10,170" },
        { flag: "🇨🇦", c: "CAD", b: "C$407" },
        { flag: "🇳🇬", c: "NGN", b: "₦789,980" },
        { flag: "🇰🇪", c: "KES", b: "KSh 88,450" },
        { flag: "🇬🇭", c: "GHS", b: "₵5,210" },
        { flag: "🇿🇲", c: "ZMW", b: "ZK 8,900" },
      ].map((w) => (
        <div key={w.c} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-neutral-50">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{w.flag}</span>
            <span className="text-[11px] font-bold text-neutral-900">{w.c}</span>
          </div>
          <span className="text-[11px] font-semibold text-neutral-700">{w.b}</span>
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
    <div className="mt-3 text-[10px] text-neutral-500">Live rate: 1 USD = 1.3642 CAD</div>
    <div className="mt-2 flex flex-wrap gap-1">
      {["NGN", "KES", "GHS", "ZMW"].map((c) => (
        <span key={c} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{c}</span>
      ))}
    </div>
    <div className="mt-auto">
      <div className="rounded-xl bg-indigo-500 text-white text-sm font-bold py-3 text-center">
        Exchange
      </div>
    </div>
  </div>
);

const HERO_WORDS = ["Send", "money", "across", "borders,", "instantly."];

const Landing = () => {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "eFinMoney — Send money across borders, instantly.";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Multi-currency wallets, live FX, and bank-grade transfers to Nigeria and Ghana. Link your bank with Plaid and send in minutes.");
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      {/* ============ NAVBAR (on dark hero) ============ */}
      <MarketingHeader variant="transparent" />

      {/* ============ HERO (deep purple, PureVPN-style) ============ */}
      <section className="relative overflow-hidden bg-grid-purple text-white">
        {/* African landscape backdrop (subtle, color-scheme preserved) */}
        <img
          src={africaHero}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen pointer-events-none"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--brand-900))]/40 via-[hsl(var(--brand-900))]/20 to-[hsl(var(--brand-900))]/60 pointer-events-none" />
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
              Africa-first. Global rails. That's eFinMoney.
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
                  {i === 0 ? <span className="text-[hsl(var(--brand-500))]">{w}</span> : i >= 3 ? <span className="text-[hsl(var(--accent-amber))]">{w}</span> : w}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.55 }}
              className="mt-7 max-w-xl text-base md:text-lg text-white/70 mx-auto lg:mx-0"
            >
              Multi-currency wallets and live FX — with Nigeria bank transfers and Ghana mobile money live today. More corridors, cards, and Canada rails are on the way.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.55 }}
              className="mt-9 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3"
            >
              <Link
                to={user ? "/dashboard" : "/auth"}
                className="group inline-flex items-center gap-2 bg-[hsl(var(--accent-amber))] hover:brightness-110 text-[hsl(var(--brand-900))] font-bold px-7 py-3.5 rounded-full text-base transition-all hover:-translate-y-0.5 shadow-cta-amber"
              >
                {user ? "Go to Dashboard" : "Get Started"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-white font-bold px-7 py-3.5 rounded-full text-base transition-all hover:bg-white/15"
              >
                How it works
              </Link>
            </motion.div>

            {/* Trust strip — factual */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.6 }}
              className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.2em] text-white/45 font-semibold"
            >
              <span className="inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> MSB Licensed</span>
              <span className="opacity-50">·</span>
              <span>SOC 2 Type II</span>
              <span className="opacity-50">·</span>
              <span>256-bit encryption</span>
            </motion.div>
          </div>

          {/* RIGHT: calculator as the hero visual, supporting photos in a clean strip below */}
          <div className="relative w-full max-w-[440px] mx-auto lg:ml-auto lg:mr-0">
            {/* Soft amber glow anchoring the calculator */}
            <div className="hidden lg:block absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] bg-[hsl(var(--accent-amber)/0.22)] blur-3xl rounded-full pointer-events-none" />

            {/* Calculator — centerpiece */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
              className="relative z-10"
            >
              <FxCalculator />
            </motion.div>

            {/* Canada → Africa photo strip (no overlap) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
              className="relative z-10 mt-4 grid grid-cols-2 gap-3"
            >
              <div className="relative">
                <img
                  src={senders}
                  alt="Black Canadian professional couple in Toronto sending money home on their smartphone"
                  width={768}
                  height={1024}
                  loading="lazy"
                  className="w-full h-[120px] sm:h-[140px] object-cover rounded-2xl ring-1 ring-white/10 shadow-xl"
                />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-black/45 backdrop-blur ring-1 ring-white/20 text-white rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Sending · Diaspora
                </span>
              </div>
              <div className="relative">
                <img
                  src={receivers}
                  alt="Smiling Black African grandmother with grandchild receiving money on her smartphone at her doorway"
                  width={768}
                  height={1024}
                  loading="lazy"
                  className="w-full h-[120px] sm:h-[140px] object-cover rounded-2xl ring-1 ring-white/10 shadow-xl"
                />
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-black/45 backdrop-blur ring-1 ring-white/20 text-white rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
                  Receiving · Africa
                </span>
              </div>
            </motion.div>
          </div>

        </div>

        {/* bottom fade into white sections */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* ============ LIVE MARKETS TICKER ============ */}
      <MarketTicker />


      {/* ============ BUILT FOR AFRICA ============ */}
      <section className="relative bg-white py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative rounded-3xl overflow-hidden shadow-card-purple ring-1 ring-[hsl(var(--brand-900))]/10"
          >
            <img
              src={africaBand}
              alt="Modern Africa — Lagos, Nairobi, Cape Town and Accra"
              loading="lazy"
              width={1280}
              height={896}
              className="w-full h-[420px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--brand-900))]/40 via-transparent to-[hsl(var(--accent-amber))]/10" />
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
              {[
                { country: "Nigeria", label: "Nigeria" },
                { country: "Kenya", label: "Kenya" },
                { country: "Ghana", label: "Ghana" },
                { country: "Zambia", label: "Zambia" },
                { country: "Canada", label: "Canada" },
                { country: "United States", label: "USA" },
              ].map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/90 text-[hsl(var(--brand-900))] backdrop-blur">
                  <CountryFlag country={c.country} size="sm" /> {c.label}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))] bg-[hsl(var(--accent))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
              Africa-first marketplace
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Built for the African continent.
            </h2>
            <p className="mt-5 text-[15px] md:text-base text-neutral-600 leading-relaxed max-w-xl">
              Nigeria bank payouts and Ghana mobile money are live today — with multi-currency
              wallets, live FX, and Plaid bank linking. More African corridors and Canada rails
              are on the roadmap.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Nigeria bank transfers",
                "Ghana MoMo top-up and payouts",
                "Multi-currency wallets with live FX",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-neutral-700">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[hsl(var(--accent-amber))]/15 text-[hsl(var(--brand-700))] flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ============ TOURISM POWERS TRANSFERS ============ */}
      <section className="relative bg-[hsl(var(--accent))]/30 py-20 md:py-24 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[hsl(var(--accent-amber)/0.08)] blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-2xl mx-auto mb-12"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))] bg-white">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
              Tourism & remittances
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Wherever travel takes you, money follows.
            </h2>
            <p className="mt-4 text-[15px] md:text-base text-neutral-600 leading-relaxed">
              Millions of travellers, families and businesses send money into Kenya,
              Zambia, Zimbabwe and beyond every year — funding safaris, hotel
              bookings, tour operators and loved ones back home. eFinMoney makes
              those flows instant, affordable and fully traceable.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { img: tourismKenya, label: "🇰🇪 Maasai Mara · Kenya", alt: "Maasai Mara safari, Kenya" },
              { img: tourismVicFalls, label: "🇿🇲 🇿🇼 Victoria Falls", alt: "Victoria Falls on the Zambia-Zimbabwe border" },
              { img: tourismZanzibar, label: "🇹🇿 Zanzibar Coast", alt: "Zanzibar coastline with dhow boat" },
            ].map((t, i) => (
              <motion.div
                key={t.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
                className="relative rounded-3xl overflow-hidden shadow-card-purple ring-1 ring-[hsl(var(--brand-900))]/10 group"
              >
                <img
                  src={t.img}
                  alt={t.alt}
                  loading="lazy"
                  width={1280}
                  height={960}
                  className="w-full h-[280px] object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--brand-900))]/70 via-transparent to-transparent" />
                <span className="absolute bottom-4 left-4 text-[12px] font-bold px-3 py-1.5 rounded-full bg-white/95 text-[hsl(var(--brand-900))] backdrop-blur shadow-sm">
                  {t.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="bg-grid-purple py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">
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
                className="group relative rounded-3xl bg-white border border-neutral-200/80 hover:border-indigo-300/60 hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-20px_rgba(16,185,129,0.25)] transition-all duration-300 overflow-hidden"
              >
                {/* photo header */}
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={f.image}
                    alt={f.title}
                    width={1024}
                    height={640}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 via-transparent to-transparent" />
                  {/* floating icon chip */}
                  <div className="absolute left-6 -bottom-7 w-14 h-14">
                    <div className="absolute inset-0 rounded-2xl bg-indigo-500/25 blur-md group-hover:bg-indigo-500/40 transition-colors" />
                    <div className="relative w-14 h-14 rounded-2xl bg-white flex items-center justify-center ring-1 ring-indigo-100 shadow-md shadow-indigo-500/10 group-hover:ring-indigo-300 group-hover:shadow-indigo-500/30 transition-all">
                      <f.icon className="w-6 h-6 text-indigo-600" strokeWidth={2} />
                    </div>
                  </div>
                </div>

                {/* subtle corner glow */}
                <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-indigo-500/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative px-8 pt-12 pb-8">
                  <h3 className="text-lg font-bold text-primary mb-2 tracking-tight">{f.title}</h3>
                  <p className="text-[15px] text-neutral-500 leading-relaxed">{f.desc}</p>

                  <div className="mt-6 h-px w-10 bg-gradient-to-r from-indigo-500 to-transparent group-hover:w-20 transition-all duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ BUILT FOR BUSINESS (B2B) ============ */}
      <section className="relative bg-white py-20 md:py-24 overflow-hidden">
        <div className="absolute -top-32 right-0 w-[600px] h-[600px] rounded-full bg-[hsl(var(--primary)/0.06)] blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-700))] bg-[hsl(var(--accent))]">
              <Building2 className="w-3 h-3" />
              eFinMoney for Business
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tight text-[hsl(var(--brand-900))]">
              Treasury, payouts and FX, in one professional platform.
            </h2>
            <p className="mt-5 text-[15px] md:text-base text-neutral-600 leading-relaxed max-w-xl">
              Move funds, run multi-entity wallets, reconcile in real time and
              pay suppliers across Africa, North America and beyond — with the
              controls and reporting your finance team expects.
            </p>
            <ul className="mt-7 grid sm:grid-cols-2 gap-3">
              {[
                { icon: Send, t: "Bulk payouts & approvals" },
                { icon: Layers, t: "Multi-entity wallets" },
                { icon: BarChart3, t: "Real-time reporting" },
                { icon: Shield, t: "SOC 2 · MSB licensed" },
              ].map((it) => (
                <li key={it.t} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200/80 bg-white">
                  <span className="w-9 h-9 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center flex-shrink-0">
                    <it.icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold text-[hsl(var(--brand-900))]">{it.t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 bg-[hsl(var(--accent-amber))] hover:brightness-110 text-[hsl(var(--brand-900))] font-bold px-6 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 shadow-cta-amber"
              >
                Talk to sales <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 bg-[hsl(var(--brand-900))] text-white font-bold px-6 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5"
              >
                Open a business account
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative order-1 lg:order-2 rounded-3xl overflow-hidden shadow-card-purple ring-1 ring-[hsl(var(--brand-900))]/10"
          >
            <img
              src={b2bPhone}
              alt="eFinMoney for Business — premium fintech dashboard on a professional desk"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-[460px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--brand-900))]/30 via-transparent to-transparent" />
          </motion.div>
        </div>
      </section>

      {/* ============ GLOBAL CORRIDORS ============ */}
      <GlobalCorridors />

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="bg-grid-purple py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-black tracking-tight text-white text-center mb-16"
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
                <h3 className="text-xl font-black text-white mb-3">{s.title}</h3>
                {s.desc && <p className="text-white/80">{s.desc}</p>}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ STATS (deep purple band) ============ */}
      <section id="trust" className="relative bg-grid-amber text-white py-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[360px] rounded-full bg-[hsl(var(--accent-amber)/0.22)] blur-[120px]" />
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[hsl(var(--accent-amber)/0.15)] blur-3xl" />
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
              Built for cross-border
            </span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight">
              Everything you need to move money
            </h2>
            <p className="mt-3 text-white/60 text-base">
              Hold multiple currencies, reach banks and mobile wallets, and settle in minutes.
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
                  <div className="text-4xl md:text-5xl font-black text-[hsl(var(--accent-amber))] leading-none">
                    {s.value}
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
      <MarketingFooter />
    </div>
  );
};

export default Landing;
