import { motion, useMotionValue, useTransform } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Plus, Send, Download, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useWallets } from "@/hooks/useWallets";
import { Skeleton } from "@/components/ui/skeleton";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import CardPaymentModal from "@/components/modals/CardPaymentModal";
import CreateWalletModal from "@/components/modals/CreateWalletModal";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { flagForCurrency } from "@/lib/flags";

const gradients: Record<string, string> = {
  USD: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  CAD: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  NGN: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  GBP: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
  EUR: "linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)",
  KES: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
};

const fallbackGradient = "linear-gradient(135deg, #475569 0%, #1e293b 100%)";

const formatBalance = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const WalletCarousel = () => {
  const { data: wallets, isLoading } = useWallets();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [topUpWalletId, setTopUpWalletId] = useState<string | null>(null);

  // Track active card via scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const cardWidth = el.firstElementChild
        ? (el.firstElementChild as HTMLElement).offsetWidth + 16
        : 320;
      const idx = Math.round(el.scrollLeft / cardWidth);
      setActiveIndex(idx);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [wallets]);

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el || !el.firstElementChild) return;
    const cardWidth = (el.firstElementChild as HTMLElement).offsetWidth + 16;
    el.scrollTo({ left: idx * cardWidth, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground">My Wallets</h2>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 min-w-[300px] rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      </section>
    );
  }

  const list = wallets || [];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">My Wallets</h2>
        <CreateWalletModal>
          <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Add Wallet
          </button>
        </CreateWalletModal>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scroll-smooth no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {list.map((w, idx) => {
          const isActive = idx === activeIndex;
          const gradient = gradients[w.currency_code] || fallbackGradient;
          const flag = flagForCurrency(w.currency_code) !== "🌍" ? flagForCurrency(w.currency_code) : (w.flag_emoji || "💰");
          return (
            <TiltCard
              key={w.wallet_id}
              idx={idx}
              isActive={isActive}
              gradient={gradient}
            >
              {/* Big flag top right */}
              <span className="absolute top-3 right-3 text-[40px] leading-none drop-shadow-md select-none pointer-events-none z-10">
                {flag}
              </span>

              {/* Floating bubbles */}
              <span className="absolute top-6 left-10 w-2 h-2 rounded-full bg-white/40 animate-bubble-drift" style={{ animationDelay: "0s" }} />
              <span className="absolute top-16 left-24 w-1.5 h-1.5 rounded-full bg-white/30 animate-bubble-drift" style={{ animationDelay: "1.5s" }} />
              <span className="absolute bottom-12 left-16 w-2.5 h-2.5 rounded-full bg-white/25 animate-bubble-drift" style={{ animationDelay: "3s" }} />
              <span className="absolute bottom-20 right-24 w-1.5 h-1.5 rounded-full bg-white/35 animate-bubble-drift" style={{ animationDelay: "4.5s" }} />

              {/* Diagonal shine on hover */}
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shine" />

              {/* Decorative orbs */}
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/5 blur-xl" />

              <div className="relative h-full p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl drop-shadow-sm">{flag}</span>
                    <div>
                      <p className="font-display font-semibold text-sm">{w.currency_code}</p>
                      <p className="text-[10px] uppercase tracking-wider text-white/60">{w.currency_name}</p>
                    </div>
                  </div>
                  {w.is_default && (
                    <span className="text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full mr-12">
                      Default
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs text-white/70 mb-1">Available Balance</p>
                  <h3 className="text-3xl font-display font-bold tracking-tight">
                    <AnimatedNumber value={Number(w.balance)} prefix={w.symbol} decimals={2} duration={1100} />
                  </h3>
                </div>

                <div className="flex gap-2">
                  <SendMoneyModal>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-xs font-medium transition-colors backdrop-blur-sm">
                      <Send className="w-3.5 h-3.5" />
                      Send
                    </button>
                  </SendMoneyModal>
                  <Link
                    to="/wallets"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-xs font-medium transition-colors backdrop-blur-sm"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Receive
                  </Link>
                  <button
                    onClick={() => setTopUpWalletId(w.wallet_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-foreground hover:bg-white/90 text-xs font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Top up
                  </button>
                </div>
              </div>
            </TiltCard>
          );
        })}

        {list.length === 0 && (
          <CreateWalletModal>
            <button className="snap-center min-w-[280px] sm:min-w-[340px] aspect-[1.6/1] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary hover:border-primary transition-colors">
              <Plus className="w-8 h-8" />
              <span className="font-medium">Create your first wallet</span>
            </button>
          </CreateWalletModal>
        )}
      </div>

      {/* Dots indicator */}
      {list.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {list.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to wallet ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}

      {topUpWalletId && (
        <CardPaymentModal
          open={!!topUpWalletId}
          onOpenChange={(o) => !o && setTopUpWalletId(null)}
          defaultWalletId={topUpWalletId}
          title="Top up wallet"
        />
      )}
      
    </section>
  );
};

interface TiltCardProps {
  idx: number;
  isActive: boolean;
  gradient: string;
  children: React.ReactNode;
}

const TiltCard = ({ idx, isActive, gradient, children }: TiltCardProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-50, 50], [5, -5]);
  const rotateY = useTransform(x, [-50, 50], [-5, 5]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  };
  const reset = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0, scale: isActive ? 1.02 : 1 }}
      transition={{ delay: idx * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ background: gradient, rotateX, rotateY, transformPerspective: 1000 }}
      className="group snap-center min-w-[280px] sm:min-w-[340px] aspect-[1.6/1] rounded-2xl relative overflow-hidden text-white shadow-xl"
    >
      {children}
    </motion.div>
  );
};

export default WalletCarousel;
