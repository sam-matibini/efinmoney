import { useState } from "react";
import { motion } from "framer-motion";
import { Wifi, Eye, EyeOff, Copy, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FAKE_NUMBER = "4111 2222 3333 1978";
const FAKE_CVV = "123";
const LAST4 = "1978";

const MockEfinVisaCard = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const copy = async (label: string, value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            eFinVISA · Virtual Visa Card
          </h2>
          <p className="text-xs text-muted-foreground">
            Tap the card to flip. Use Reveal to view full details.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Clock className="w-3 h-3" /> Issuing pending enablement
        </Badge>
      </div>

      <div className="max-w-md" style={{ perspective: "1400px" }}>
        <motion.div
          className="relative w-full aspect-[1.586/1] cursor-pointer"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 14, duration: 0.7 }}
          onClick={() => setIsFlipped((f) => !f)}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 rounded-2xl p-5 text-white overflow-hidden shadow-2xl"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              background:
                "linear-gradient(135deg, #0b1f4a 0%, #112a63 35%, #1d4ed8 70%, #2563eb 100%)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.28) 48%, rgba(255,255,255,0.10) 55%, transparent 68%)",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />

            <div className="relative h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div className="font-display text-lg leading-none tracking-tight">
                  <span className="font-light opacity-90">efin</span>
                  <span className="font-bold">Money</span>
                </div>
                <Wifi className="w-5 h-5 rotate-90 opacity-90" />
              </div>

              <div
                className="w-9 h-7 rounded-[5px] shadow-inner"
                style={{
                  background:
                    "linear-gradient(135deg, #d4a64a 0%, #f0d27a 40%, #b6822f 100%)",
                }}
              />

              <div className="font-mono text-[1.05rem] sm:text-xl tracking-[0.22em] flex items-center gap-3">
                <span className="opacity-90">••••</span>
                <span className="opacity-90">••••</span>
                <span className="opacity-90">••••</span>
                <span className="font-semibold">{LAST4}</span>
              </div>

              <div className="flex items-end justify-between">
                <div className="min-w-0">
                  <div className="text-[9px] tracking-[0.18em] opacity-70">CARDHOLDER</div>
                  <div className="text-sm font-semibold tracking-wide truncate max-w-[12rem]">
                    CARD PENDING
                  </div>
                </div>
                <div>
                  <div className="text-[9px] tracking-[0.18em] opacity-70">EXPIRES</div>
                  <div className="text-sm font-mono">12/29</div>
                </div>
                <div className="italic font-extrabold text-xl tracking-tight">VISA</div>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 rounded-2xl text-white overflow-hidden shadow-2xl"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background:
                "linear-gradient(135deg, #0b1f4a 0%, #112a63 35%, #1d4ed8 70%, #2563eb 100%)",
            }}
          >
            <div className="relative h-full flex flex-col">
              {/* Magnetic stripe */}
              <div className="mt-5 h-11 w-full bg-black/85" />

              <div className="px-5 mt-5 space-y-3 text-sm flex-1">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Card number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono tracking-wider">
                      {isRevealed ? FAKE_NUMBER : `•••• •••• •••• ${LAST4}`}
                    </p>
                    {isRevealed && (
                      <button
                        onClick={(e) => copy("Card number", FAKE_NUMBER.replace(/\s/g, ""), e)}
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
                    <p className="font-mono">12/29</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-70">CVV</p>
                    <p className="font-mono">{isRevealed ? FAKE_CVV : "•••"}</p>
                  </div>
                  <div className="ml-auto">
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
