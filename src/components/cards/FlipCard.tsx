import { useRef, useState, MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Wifi, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Card as CardRow } from "@/hooks/useCards";

interface FlipCardProps {
  card: CardRow;
  flipped: boolean;
  onToggle: () => void;
  index: number;
}

const formatPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim();

const FlipCard = ({ card, flipped, onToggle, index }: FlipCardProps) => {
  const isExternal = card.funding_source === "external";
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });
  const [hovering, setHovering] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([]);

  // Premium gradient by card network
  // Premium brand gradients: Visa = deep sapphire blue, Mastercard = dark charcoal
  const bgClass =
    card.card_network === "mastercard"
      ? "bg-[linear-gradient(135deg,#0a0a0a_0%,#1a1a1a_50%,#2a2a2a_100%)]"
      : "bg-[linear-gradient(135deg,#021431_0%,#0a2f6e_50%,#1d4ed8_100%)]";

  const expiry =
    card.expiry_month && card.expiry_year
      ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
      : "--/--";

  const maskedNumber = `•••• •••• •••• ${card.last_four}`;


  const copy = async (label: string, value: string, e: MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    setTilt({
      ry: (px - 0.5) * 18,   // rotate Y
      rx: -(py - 0.5) * 12,  // rotate X
      mx: px * 100,
      my: py * 100,
    });
  };

  const handleMouseLeave = () => {
    setHovering(false);
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 });
  };

  const handleClick = () => {
    // particle burst
    const burst = Array.from({ length: 14 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.cos((i / 14) * Math.PI * 2),
      y: Math.sin((i / 14) * Math.PI * 2),
    }));
    setParticles(burst);
    setTimeout(() => setParticles([]), 700);
    onToggle();
  };

  const Chip = () => (
    <div className="w-10 h-7 rounded-md bg-[linear-gradient(135deg,#fde68a_0%,#f59e0b_50%,#b45309_100%)] shadow-inner relative overflow-hidden">
      <div className="absolute inset-1 grid grid-cols-3 gap-px opacity-50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-amber-900/40 rounded-[1px]" />
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className="relative w-full aspect-[1.586/1] cursor-pointer select-none"
      style={{ perspective: "1400px" }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Soft floating glow */}
      <motion.div
        animate={{
          opacity: hovering ? 0.55 : 0.25,
          scale: hovering ? 1.04 : 1,
        }}
        transition={{ duration: 0.3 }}
        className="absolute -inset-4 rounded-[28px] bg-emerald-500/30 blur-2xl pointer-events-none"
      />

      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{
          rotateY: flipped ? 180 : 0,
          rotateX: hovering && !flipped ? tilt.rx : 0,
          // small Y offset in tilt only when not flipping
          rotateZ: 0,
          scale: 1,
        }}
        transition={{
          rotateY: { type: "spring", stiffness: 80, damping: 14, duration: 0.7 },
          rotateX: { type: "spring", stiffness: 200, damping: 20 },
        }}
      >
        {/* extra in-flip pulse via key animation */}
        <motion.div
          key={flipped ? "f" : "b"}
          initial={{ scale: 0.97 }}
          animate={{ scale: [0.97, 1.05, 1] }}
          transition={{ duration: 0.7, times: [0, 0.5, 1], ease: "easeInOut" }}
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* ============== FRONT ============== */}
          <div
            className={`absolute inset-0 rounded-2xl p-6 text-white overflow-hidden ${bgClass} shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]`}
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: `rotateY(${hovering && !flipped ? tilt.ry : 0}deg)`,
            }}
          >
            {/* diagonal texture */}
            <div
              className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 6px)",
              }}
            />

            {/* holographic shimmer following mouse */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                opacity: hovering ? 0.9 : 0,
                background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.35) 0%, rgba(255,200,255,0.18) 25%, rgba(120,220,255,0.12) 45%, transparent 65%)`,
                mixBlendMode: "overlay",
              }}
            />

            {/* gloss sweep on flip */}
            <motion.div
              key={`sweep-${flipped}`}
              initial={{ x: "-120%" }}
              animate={{ x: "140%" }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              className="absolute inset-y-0 -left-1/3 w-1/3 pointer-events-none"
              style={{
                background:
                  "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                mixBlendMode: "screen",
              }}
            />

            {/* soft blobs */}
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-white/5 blur-2xl" />

            {card.status !== "active" && (
              <div className="absolute top-3 right-3 z-10">
                <Badge variant="secondary">
                  {card.status === "frozen" ? "❄️ Frozen" : "🚫 Cancelled"}
                </Badge>
              </div>
            )}

            <div className="relative z-10 h-full flex flex-col">
              {/* Top: brand + contactless */}
              <div className="flex items-start justify-between">
                <span className="font-display font-black text-lg tracking-tight">
                  efin<span className="opacity-70">Money</span>
                </span>
                <Wifi className="w-5 h-5 rotate-90 opacity-80" />
              </div>

              {/* Chip */}
              <div className="mt-4">
                <Chip />
              </div>

              {/* Card number */}
              <div className="mt-4 font-mono text-xl tracking-[0.18em] drop-shadow">
                •••• •••• •••• <span className="text-white">{card.last_four}</span>
              </div>

              {/* Bottom row */}
              <div className="mt-auto flex items-end justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-widest opacity-60">Cardholder</p>
                  <p className="font-medium text-sm uppercase tracking-wide truncate max-w-[180px]">
                    {card.cardholder_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-widest opacity-60">Expires</p>
                  <p className="font-mono text-sm">{expiry}</p>
                </div>
                {card.card_network === "visa" ? (
                  <span className="font-display italic font-extrabold text-2xl tracking-tight ml-3 drop-shadow">
                    VISA
                  </span>
                ) : (
                  <div className="relative h-7 w-12 ml-3">
                    <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-[#eb001b] shadow-[0_0_12px_rgba(235,0,27,0.5)]" />
                    <span className="absolute right-0 top-0 w-7 h-7 rounded-full bg-[#f79e1b] mix-blend-screen shadow-[0_0_12px_rgba(247,158,27,0.5)]" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ============== BACK ============== */}
          <div
            className={`absolute inset-0 rounded-2xl text-white overflow-hidden ${bgClass} shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]`}
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 6px)",
              }}
            />

            {isExternal ? (
              <div className="relative z-10 h-full flex flex-col">
                {/* magnetic strip */}
                <div className="mt-5 h-11 w-full bg-gradient-to-b from-neutral-900 via-black to-neutral-900 shadow-inner" />

                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    className="relative w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center border border-white/20 shadow-[0_0_24px_rgba(16,185,129,0.35)]"
                  >
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl" />
                    <ShieldCheck className="relative w-7 h-7 text-emerald-300" strokeWidth={2.2} />
                  </motion.div>
                  <p className="mt-3 font-display font-semibold tracking-tight text-base">
                    Bank-Grade Encryption
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-white/65 max-w-[260px]">
                    For your security, this card is tokenized and vaulted by Stripe.
                    Full card details are permanently hidden.
                  </p>
                </div>

                <motion.p
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="pb-4 text-[10px] uppercase tracking-[0.3em] text-center"
                >
                  Tap to flip back
                </motion.p>
              </div>
            ) : (
              <div className="relative z-10 h-full flex flex-col">
                {/* magnetic strip */}
                <div className="mt-5 h-11 w-full bg-black/85" />

                <div className="px-6 mt-5 space-y-3 text-sm flex-1">
                  {/* CVV box */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white text-neutral-900 rounded-md h-9 flex items-center justify-end pr-3 font-mono tracking-widest text-base shadow-inner">
                      {card.cvv ?? "•••"}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest opacity-70">CVV</span>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-70">Card number</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono tracking-wider truncate">{maskedNumber}</p>
                      {card.card_number && (
                        <button
                          onClick={(e) => copy("Card number", card.card_number!, e)}
                          className="p-1 rounded-md bg-white/10 hover:bg-white/20"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-70">Expires</p>
                      <p className="font-mono">{expiry}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] uppercase tracking-widest opacity-70">Limit</p>
                      <p className="font-mono">
                        ${Number(card.spending_limit).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                    {/* hologram */}
                    <div className="w-9 h-9 rounded-full bg-[conic-gradient(from_0deg,#fde68a,#fca5a5,#a7f3d0,#bfdbfe,#ddd6fe,#fde68a)] shadow-inner border border-white/30" />
                  </div>
                </div>

                <motion.p
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="pb-4 text-[10px] uppercase tracking-[0.3em] text-center"
                >
                  Tap to flip back
                </motion.p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Particle burst */}
      <AnimatePresence>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{ opacity: 0, x: p.x * 90, y: p.y * 90, scale: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-400 pointer-events-none"
            style={{ boxShadow: "0 0 8px rgba(16,185,129,0.8)" }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default FlipCard;
