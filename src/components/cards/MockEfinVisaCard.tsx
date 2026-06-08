import { useState } from "react";
import { motion } from "framer-motion";
import { Wifi, Eye, EyeOff, Copy, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FAKE_NUMBER = "4111 2222 3333 1978";
const FAKE_CVV = "123";
const LAST4 = "1978";

// Premium EMV chip — gold gradient with engraved circuit lines
const EmvChip = () => (
  <div className="relative w-11 h-8 rounded-[6px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_-1px_2px_rgba(0,0,0,0.3)]"
    style={{
      background:
        "linear-gradient(135deg, #f6e7a8 0%, #d4af4f 30%, #b8862a 60%, #f3d97a 100%)",
    }}>
    <div className="absolute inset-[3px] grid grid-cols-3 gap-[2px] opacity-60">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="bg-amber-900/50 rounded-[1px]" />
      ))}
    </div>
    <div className="absolute inset-y-[40%] left-0 right-0 h-px bg-amber-950/40" />
    <div className="absolute inset-x-[40%] top-0 bottom-0 w-px bg-amber-950/40" />
  </div>
);

const MockEfinVisaCard = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const copy = async (label: string, value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  // Mesh gradient: emerald → sapphire → indigo
  const meshBg = `
    radial-gradient(at 18% 22%, rgba(16,185,129,0.55) 0px, transparent 45%),
    radial-gradient(at 82% 18%, rgba(59,130,246,0.45) 0px, transparent 50%),
    radial-gradient(at 75% 88%, rgba(99,102,241,0.55) 0px, transparent 55%),
    radial-gradient(at 12% 85%, rgba(6,95,70,0.65) 0px, transparent 50%),
    linear-gradient(135deg, #021f1a 0%, #0a2540 45%, #1e1b4b 100%)
  `;

  // SVG noise overlay
  const noiseSvg = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>")`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            eFinVISA · Virtual Visa Card
          </h2>
          <p className="text-xs text-muted-foreground">
            Tap the card to flip. Use Reveal to view full details.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-300">
          <Clock className="w-3 h-3" /> Issuing pending enablement
        </Badge>
      </div>

      <div className="max-w-md" style={{ perspective: "1600px" }}>
        <motion.div
          className="relative w-full aspect-[1.586/1] cursor-pointer"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          whileHover={{ scale: 1.015, y: -2 }}
          onClick={() => setIsFlipped((f) => !f)}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 rounded-2xl p-5 text-white overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              background: meshBg,
              boxShadow:
                "0 20px 50px -12px rgba(16,185,129,0.4), 0 8px 24px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            {/* noise */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay"
              style={{ backgroundImage: noiseSvg }}
            />
            {/* gloss sweep */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.14) 48%, rgba(255,255,255,0.22) 52%, transparent 68%)",
              }}
            />
            {/* corner glow */}
            <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-indigo-700/30 blur-3xl pointer-events-none" />

            <div className="relative h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div className="font-display text-lg leading-none tracking-tight">
                  <span className="font-light opacity-90">efin</span>
                  <span className="font-bold">Money</span>
                </div>
                <Wifi className="w-5 h-5 rotate-90 opacity-90 drop-shadow" aria-label="Contactless" />
              </div>

              <EmvChip />

              <div className="font-mono text-[1.05rem] sm:text-xl tracking-[0.22em] flex items-center gap-3 drop-shadow"
                style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace" }}>
                <span className="opacity-90">••••</span>
                <span className="opacity-90">••••</span>
                <span className="opacity-90">••••</span>
                <span className="font-semibold">{LAST4}</span>
              </div>

              <div className="flex items-end justify-between">
                <div className="min-w-0">
                  <div className="text-[9px] tracking-[0.18em] opacity-70">CARDHOLDER</div>
                  <div className="text-sm font-semibold tracking-wide truncate max-w-[12rem]">
                    Samson Matibini
                  </div>
                </div>
                <div>
                  <div className="text-[9px] tracking-[0.18em] opacity-70">EXPIRES</div>
                  <div className="text-sm font-mono">12/29</div>
                </div>
                <div className="italic font-extrabold text-xl tracking-tight drop-shadow">VISA</div>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 rounded-2xl text-white overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: meshBg,
              boxShadow:
                "0 20px 50px -12px rgba(16,185,129,0.4), 0 8px 24px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay"
              style={{ backgroundImage: noiseSvg }}
            />

            <div className="relative h-full flex flex-col">
              {/* Full-width charcoal magnetic stripe */}
              <div className="mt-5 h-12 w-full bg-gradient-to-b from-neutral-900 via-black to-neutral-900 shadow-inner" />

              <div className="px-5 mt-5 space-y-3 text-sm flex-1">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Card number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono tracking-wider"
                      style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace" }}>
                      {isRevealed ? FAKE_NUMBER : `•••• •••• •••• ${LAST4}`}
                    </p>
                    {isRevealed && (
                      <button
                        onClick={(e) => copy("Card number", FAKE_NUMBER.replace(/\s/g, ""), e)}
                        className="p-1 rounded-md bg-white/10 hover:bg-white/20 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-70">Expires</p>
                    <p className="font-mono">12/29</p>
                  </div>
                  {/* Signature box with CVV */}
                  <div className="flex items-center gap-2">
                    <div className="relative h-8 w-28 bg-white rounded-sm overflow-hidden shadow-inner">
                      <div
                        className="absolute inset-0 opacity-60"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(45deg, #e5e7eb 0 6px, #ffffff 6px 12px)",
                        }}
                      />
                      <div className="absolute inset-y-0 right-0 w-10 bg-white flex items-center justify-center font-mono text-neutral-900 text-sm tracking-widest border-l border-neutral-200">
                        {isRevealed ? FAKE_CVV : "•••"}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest opacity-70">CVV</span>
                  </div>
                  <div className="ml-auto">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRevealed((r) => !r);
                        }}
                        className="gap-1"
                      >
                        {isRevealed ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Reveal Details
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </div>
                </div>

                <p className="text-[10px] opacity-70 pt-1">
                  Card issuance pending enablement — preview only.
                </p>
              </div>

              <p className="pb-3 text-[10px] uppercase tracking-[0.3em] text-center opacity-70">
                Tap to flip back
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default MockEfinVisaCard;
