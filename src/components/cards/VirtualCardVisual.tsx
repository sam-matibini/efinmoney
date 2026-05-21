import { motion } from "framer-motion";
import { CreditCard, Wifi } from "lucide-react";

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
}

const gradientFor = (purposeOrBrand: string) => {
  // Distinctive dark gradient — eFinMoney brand
  const map: Record<string, string> = {
    visa: "from-emerald-700 via-emerald-900 to-slate-900",
    mastercard: "from-amber-700 via-rose-900 to-slate-900",
  };
  return map[purposeOrBrand] || "from-emerald-700 via-emerald-900 to-slate-900";
};

const VirtualCardVisual = ({
  brand = "visa",
  last4,
  nickname,
  currency = "CAD",
  status = "active",
  expMonth,
  expYear,
  small = false,
}: VirtualCardVisualProps) => {
  const dimmed = status !== "active";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full ${small ? "aspect-[1.6/1] max-w-[280px]" : "aspect-[1.586/1] max-w-md"} rounded-2xl overflow-hidden bg-gradient-to-br ${gradientFor(brand)} text-white shadow-xl ${
        dimmed ? "opacity-60 grayscale" : ""
      }`}
    >
      {/* shine */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="relative h-full p-5 flex flex-col justify-between font-mono">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">eFinMoney</div>
            <div className="text-sm font-semibold mt-0.5 truncate max-w-[12rem]">{nickname || "Virtual Card"}</div>
          </div>
          <span className="text-[10px] uppercase px-2 py-0.5 bg-white/10 rounded-full backdrop-blur">
            {status}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2 text-lg tracking-widest">
            <span className="opacity-60">••••</span>
            <span className="opacity-60">••••</span>
            <span className="opacity-60">••••</span>
            <span className="font-bold">{last4 || "••••"}</span>
          </div>
        </div>
        <div className="flex items-end justify-between text-[11px]">
          <div>
            <div className="opacity-60">Exp</div>
            <div>
              {expMonth ? String(expMonth).padStart(2, "0") : "••"}/
              {expYear ? String(expYear).slice(-2) : "••"}
            </div>
          </div>
          <div className="text-right">
            <div className="opacity-60">{currency}</div>
            <div className="uppercase font-bold tracking-wider">{brand}</div>
          </div>
          <CreditCard className="w-6 h-6 opacity-80" />
        </div>
      </div>
    </motion.div>
  );
};

export default VirtualCardVisual;
