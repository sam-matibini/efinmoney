import { motion } from "framer-motion";
import { Wifi } from "lucide-react";

interface VirtualCardVisualProps {
  brand?: string;
  last4?: string | null;
  nickname?: string | null;
  currency?: string;
  status?: "active" | "frozen" | "cancelled" | "pending";
  expMonth?: number | null;
  expYear?: number | null;
  small?: boolean;
  tapToPay?: boolean;
  cardholderName?: string | null;
}

const VirtualCardVisual = ({
  brand = "visa",
  last4,
  nickname,
  currency = "CAD",
  status = "active",
  expMonth,
  expYear,
  small = false,
  tapToPay = true,
  cardholderName,
}: VirtualCardVisualProps) => {
  const dimmed = status !== "active";
  const holder = (cardholderName || nickname || "CARDHOLDER NAME").toUpperCase();
  const isMastercard = brand === "mastercard";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full ${small ? "aspect-[1.6/1] max-w-[280px]" : "aspect-[1.586/1] max-w-md"} rounded-2xl overflow-hidden text-white shadow-2xl ${
        dimmed ? "opacity-60 grayscale" : ""
      }`}
      style={{
        background:
          "linear-gradient(135deg, #0a1f1c 0%, #0f3a30 35%, #065f46 70%, #0d7a5f 100%)",
      }}
    >
      {/* diagonal shine band */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.28) 48%, rgba(255,255,255,0.10) 55%, transparent 68%)",
        }}
      />
      {/* subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />

      <div className="relative h-full p-5 flex flex-col justify-between">
        {/* top row: wordmark + contactless */}
        <div className="flex items-start justify-between">
          <div className="font-display text-lg leading-none tracking-tight">
            <span className="font-light opacity-90">efin</span>
            <span className="font-bold">Money</span>
          </div>
          {tapToPay && !dimmed && (
            <Wifi className="w-5 h-5 rotate-90 opacity-90" aria-label="Tap to pay enabled" />
          )}
        </div>

        {/* chip */}
        <div className="-mt-2">
          <div
            className="w-9 h-7 rounded-[5px] shadow-inner"
            style={{
              background:
                "linear-gradient(135deg, #d4a64a 0%, #f0d27a 40%, #b6822f 100%)",
            }}
          />
        </div>

        {/* card number */}
        <div className="font-mono text-[1.05rem] sm:text-xl tracking-[0.22em] flex items-center gap-3">
          <span className="opacity-90">••••</span>
          <span className="opacity-90">••••</span>
          <span className="opacity-90">••••</span>
          <span className="font-semibold">{last4 || "••••"}</span>
        </div>

        {/* bottom row */}
        <div className="flex items-end justify-between">
          <div className="min-w-0">
            <div className="text-[9px] tracking-[0.18em] opacity-70">CARDHOLDER</div>
            <div className="text-sm font-semibold tracking-wide truncate max-w-[12rem]">
              {holder}
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.18em] opacity-70">EXPIRES</div>
            <div className="text-sm font-mono">
              {expMonth ? String(expMonth).padStart(2, "0") : "••"}/
              {expYear ? String(expYear).slice(-2) : "••"}
            </div>
          </div>
          <div className="text-right">
            {isMastercard ? (
              <div className="relative h-6 w-12">
                <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-red-500/90" />
                <span className="absolute right-0 top-0 w-6 h-6 rounded-full bg-amber-400/90 mix-blend-screen" />
              </div>
            ) : (
              <div className="italic font-extrabold text-xl tracking-tight">
                <span>VISA</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default VirtualCardVisual;
