import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Shield, Zap, Globe2, DollarSign, Euro, Bitcoin } from "lucide-react";
import RippleButton from "@/components/ui/RippleButton";

const FEATURE_CARDS = [
  { icon: Zap, emoji: "💸", title: "Instant Transfers", desc: "Send money in seconds, not days" },
  { icon: Shield, emoji: "🔒", title: "Bank-Grade Security", desc: "End-to-end encryption & 2FA" },
  { icon: Globe2, emoji: "🌍", title: "50+ Countries", desc: "Reach recipients across the globe" },
];

const FX_TICKER = [
  "USD → KES  128.45",
  "CAD → NGN  580.10",
  "USD → GHS  15.20",
  "EUR → ZAR  19.85",
  "GBP → INR  105.30",
  "USD → CAD  1.36",
  "USD → EUR  0.92",
  "CAD → USD  0.74",
];

const FLOATING_ICONS = [
  { Icon: DollarSign, top: "12%", left: "10%", delay: 0, size: 28 },
  { Icon: Euro, top: "70%", left: "8%", delay: 1.5, size: 24 },
  { Icon: Globe2, top: "20%", left: "75%", delay: 0.8, size: 32 },
  { Icon: Bitcoin, top: "75%", left: "78%", delay: 2.2, size: 26 },
  { Icon: DollarSign, top: "45%", left: "85%", delay: 3, size: 20 },
];

const Typewriter = ({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) => {
  const chars = useMemo(() => text.split(""), [text]);
  return (
    <span className={className}>
      {chars.map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + i * 0.04, duration: 0.01 }}
        >
          {c}
        </motion.span>
      ))}
    </span>
  );
};

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Stable bubble positions/delays
  const bubbles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        left: `${(i * 7 + 5) % 95}%`,
        size: 8 + ((i * 11) % 22),
        delay: (i * 0.7) % 12,
        duration: 9 + ((i * 1.3) % 8),
      })),
    [],
  );

  useEffect(() => {
    document.title = isSignUp ? "Create account · eFinMoney" : "Sign in · eFinMoney";
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) toast.error(error.message);
        else {
          toast.success("Account created! Welcome to eFinMoney.");
          navigate("/");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message);
        else {
          toast.success("Welcome back!");
          navigate("/");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* ====== LEFT PANEL ====== */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, hsl(160 84% 39%) 0%, hsl(160 84% 28%) 100%)" }}>

        {/* Radial highlight */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        </div>

        {/* Floating icons */}
        {FLOATING_ICONS.map(({ Icon, top, left, delay, size }, i) => (
          <div
            key={i}
            className="absolute text-white/15 animate-float-slow pointer-events-none"
            style={{ top, left, animationDelay: `${delay}s` }}
          >
            <Icon size={size} strokeWidth={1.5} />
          </div>
        ))}

        {/* Bubbles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {bubbles.map((b, i) => (
            <span
              key={i}
              className="absolute bottom-0 rounded-full bg-white/15 animate-bubble-up"
              style={{
                left: b.left,
                width: b.size,
                height: b.size,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between px-14 py-14 w-full">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-2xl font-bold">e</span>
            </div>
            <span className="font-display font-bold text-2xl">eFinMoney</span>
          </motion.div>

          <div className="max-w-md">
            <h1 className="text-4xl xl:text-5xl font-display font-bold leading-tight mb-5">
              <Typewriter text="Send money across borders," delay={0.3} />
              <br />
              <span className="text-white/90">
                <Typewriter text="instantly." delay={1.5} />
              </span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.1, duration: 0.5 }}
              className="text-lg text-white/80 mb-8"
            >
              Multi-currency wallets, FX, crypto, and mobile money — all in one premium fintech experience.
            </motion.p>

            <div className="space-y-3">
              {FEATURE_CARDS.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 2.4 + i * 0.18, duration: 0.5, ease: "easeOut" }}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15"
                >
                  <div className="text-2xl">{f.emoji}</div>
                  <div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-white/75">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Live ticker */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3, duration: 0.6 }}
            className="relative w-full overflow-hidden rounded-xl bg-white/10 backdrop-blur-md border border-white/15 py-3"
          >
            <div className="flex w-max animate-marquee whitespace-nowrap">
              {[...FX_TICKER, ...FX_TICKER].map((line, i) => (
                <span key={i} className="mx-6 text-sm font-medium text-white/90">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 mr-2 animate-pulse" />
                  {line}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ====== RIGHT PANEL ====== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="gradient-primary w-10 h-10 rounded-xl flex items-center justify-center shadow-glow">
              <span className="text-xl font-bold text-primary-foreground">e</span>
            </div>
            <span className="font-display font-bold text-xl text-foreground">eFinMoney</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp ? "Start sending money in minutes" : "Sign in to access your wallets"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label htmlFor="fullName" className="text-foreground/80">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-12 h-12 bg-secondary border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
                      required={isSignUp}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/80">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12 h-12 bg-secondary border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground/80">Password</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-12 pr-12 h-12 bg-secondary border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <RippleButton
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isSignUp ? "Create Account" : "Sign In"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </RippleButton>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-2 text-primary hover:underline font-medium"
              >
                {isSignUp ? "Sign in" : "Create one"}
              </button>
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 pt-6 border-t border-border text-center"
          >
            <p className="text-xs text-muted-foreground mb-2">
              Trusted by 10,000+ users across 50 countries
            </p>
            <div className="flex justify-center gap-2 text-xl">
              <span>🇨🇦</span><span>🇺🇸</span><span>🇬🇧</span><span>🇰🇪</span>
              <span>🇳🇬</span><span>🇬🇭</span><span>🇿🇦</span>
            </div>
          </motion.div>

          {isSignUp && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
