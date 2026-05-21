import { useState, MouseEvent } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Copy, Wifi, Check } from "lucide-react";
import { toast } from "sonner";

export interface PremiumVirtualCardData {
  id: string;
  cardholderName: string;
  fullNumber: string; // 16 digits, no spaces
  cvv: string;
  expMonth: number;
  expYear: number; // 4-digit
  currency: string;
  network?: "visa" | "mastercard";
  variant?: "obsidian" | "emerald" | "platinum";
}

interface Props {
  card: PremiumVirtualCardData;
}

const formatPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim();
const maskPan = (pan: string) => `•••• •••• •••• ${pan.slice(-4)}`;

const variants: Record<NonNullable<PremiumVirtualCardData["variant"]>, string> = {
  obsidian:
    "bg-[linear-gradient(135deg,#0b0b10_0%,#1a1d29_40%,#2a2f44_70%,#0b0b10_100%)]",
  emerald:
    "bg-[linear-gradient(135deg,#021a13_0%,#0b3a2a_40%,#10b981_120%)]",
  platinum:
    "bg-[linear-gradient(135deg,#3a3f4b_0%,#6b7280_45%,#cbd5e1_100%)]",
};

const Chip = () => (
  <div className="w-11 h-8 rounded-md bg-[linear-gradient(135deg,#fde68a_0%,#f59e0b_50%,#b45309_100%)] shadow-inner relative overflow-hidden">
    <div className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-px opacity-60">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="bg-amber-900/40 rounded-[1px]" />
      ))}
    </div>
  </div>
);

const PremiumVirtualCard = ({ card }: Props) => {
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });
  const [hover, setHover] = useState(false);

  const variant = card.variant ?? "obsidian";
  const network = card.network ?? "visa";
  const expiry = `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({
      ry: (px - 0.5) * 14,
      rx: -(py - 0.5) * 10,
      mx: px * 100,
      my: py * 100,
    });
  };

  const onLeave = () => {
    setHover(false);
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 });
  };

  const copyNumber = async (e: MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(card.fullNumber);
    setCopied(true);
    toast.success("Card number copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleReveal = (e: MouseEvent) => {
    e.stopPropagation();
    setRevealed((r) => !r);
  };

  return (
    <div
      className="relative w-full aspect-[1.586/1] cursor-pointer select-none"
      style={{ perspective: "1400px" }}
      onClick={() => setFlipped((f) => !f)}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={onLeave}
    >
      {/* Ambient glow */}
      <motion.div
        animate={{ opacity: hover ? 0.55 : 0.25, scale: hover ? 1.05 : 1 }}
        transition={{ duration: 0.3 }}
        className="absolute -inset-4 rounded-[28px] bg-emerald-500/20 blur-2xl pointer-events-none"
      />

      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{
          rotateY: flipped ? 180 : 0,
          rotateX: hover && !flipped ? tilt.rx : 0,
        }}
        transition={{
          rotateY: { type: "spring", stiffness: 80, damping: 14 },
          rotateX: { type: "spring", stiffness: 200, damping: 20 },
        }}
      >
        {/* ============= FRONT ============= */}
        <div
          className={`absolute inset-0 rounded-2xl p-6 text-white overflow-hidden ${variants[variant]} shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: `rotateY(${hover && !flipped ? tilt.ry : 0}deg)`,
          }}
        >
          {/* Glass + texture */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
          <div
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 7px)",
            }}
          />
          {/* Holographic shimmer */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: hover ? 0.85 : 0,
              background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.4) 0%, rgba(167,243,208,0.18) 30%, rgba(120,220,255,0.12) 50%, transparent 70%)`,
              mixBlendMode: "overlay",
            }}
          />
          <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-display font-black text-lg tracking-tight">
                  efin<span className="opacity-70">Money</span>
                </span>
                <p className="text-[10px] uppercase tracking-[0.25em] opacity-60 mt-0.5">
                  Virtual · {card.currency}
                </p>
              </div>
              <Wifi className="w-5 h-5 rotate-90 opacity-80" />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Chip />
            </div>

            <div className="mt-4 font-mono text-xl tracking-[0.2em] drop-shadow">
              {maskPan(card.fullNumber)}
            </div>

            <div className="mt-auto flex items-end justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-widest opacity-60">
                  Cardholder
                </p>
                <p className="font-medium text-sm uppercase tracking-wide truncate max-w-[200px]">
                  {card.cardholderName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-widest opacity-60">Expires</p>
                <p className="font-mono text-sm">{expiry}</p>
              </div>
              <span className="font-display italic font-extrabold text-2xl tracking-tight ml-3">
                {network === "mastercard" ? "Mastercard" : "VISA"}
              </span>
            </div>
          </div>
        </div>

        {/* ============= BACK ============= */}
        <div
          className={`absolute inset-0 rounded-2xl text-white overflow-hidden ${variants[variant]} shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />

          <div className="relative z-10 h-full flex flex-col">
            {/* Magnetic stripe */}
            <div className="mt-5 h-11 w-full bg-black/90" />

            <div className="px-6 mt-5 space-y-3 flex-1">
              {/* Card number */}
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-70">
                  Card number
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-mono tracking-wider text-base">
                    {revealed ? formatPan(card.fullNumber) : maskPan(card.fullNumber)}
                  </p>
                  {revealed && (
                    <button
                      onClick={copyNumber}
                      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition"
                      aria-label="Copy card number"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">
                    Expires
                  </p>
                  <p className="font-mono">{expiry}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">CVV</p>
                  <div className="bg-white text-neutral-900 rounded-md h-8 px-3 flex items-center font-mono tracking-widest text-sm shadow-inner min-w-[64px] justify-end">
                    {revealed ? card.cvv : "•••"}
                  </div>
                </div>
                {/* Hologram */}
                <div className="ml-auto w-9 h-9 rounded-full bg-[conic-gradient(from_0deg,#fde68a,#fca5a5,#a7f3d0,#bfdbfe,#ddd6fe,#fde68a)] shadow-inner border border-white/30" />
              </div>

              <button
                onClick={toggleReveal}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 text-xs font-medium tracking-wide transition"
              >
                {revealed ? (
                  <>
                    <EyeOff className="w-4 h-4" /> Hide details
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" /> Reveal details
                  </>
                )}
              </button>
            </div>

            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="pb-3 text-[10px] uppercase tracking-[0.3em] text-center"
            >
              Tap card to flip back
            </motion.p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PremiumVirtualCard;
