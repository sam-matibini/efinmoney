import { useState } from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
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
  const isFrozen = card.status === "frozen";
  const isExternal = card.funding_source === "external";

  const bgClass =
    card.card_network === "mastercard" || index % 2 === 1
      ? "bg-gradient-to-br from-purple-500 to-pink-500"
      : "bg-[hsl(var(--primary))]";

  const expiry =
    card.expiry_month && card.expiry_year
      ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
      : "--/--";

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div
      className="relative w-full aspect-[1.6/1] cursor-pointer select-none"
      style={{ perspective: "1200px" }}
      onClick={onToggle}
    >
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* FRONT */}
        <div
          className={`absolute inset-0 rounded-2xl p-6 text-primary-foreground shadow-xl overflow-hidden ${bgClass} ${
            card.status !== "active" ? "opacity-80" : ""
          }`}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary-foreground/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-primary-foreground/10 blur-2xl" />

          {card.status !== "active" && (
            <div className="absolute top-3 right-3 z-10">
              <Badge variant="secondary">
                {card.status === "frozen" ? "❄️ Frozen" : "🚫 Cancelled"}
              </Badge>
            </div>
          )}

          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-start justify-between">
              <span className="font-display font-bold text-xl tracking-tight">
                efin<span className="opacity-80">Money</span>
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-primary-foreground/15 backdrop-blur-sm flex items-center justify-center">
                <span className="font-display font-bold text-4xl">e</span>
              </div>
            </div>

            <div className="flex items-end justify-between">
              <p className="text-xs uppercase tracking-widest opacity-80">
                {card.card_type === "debit_visa" ? "Debit" : card.card_type}
              </p>
              <span className="font-display italic font-extrabold text-2xl tracking-tight">
                {card.card_network === "visa" ? "VISA" : "Mastercard"}
              </span>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className={`absolute inset-0 rounded-2xl text-primary-foreground shadow-xl overflow-hidden ${bgClass}`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 bg-foreground/20" />
          <div className="relative z-10 h-full flex flex-col p-5">
            <div className="-mx-5 mt-2 h-10 bg-foreground/70" />

            <div className="mt-5 space-y-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-70">Cardholder</p>
                <p className="font-medium">{card.cardholder_name}</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Card number</p>
                  <p className="font-mono tracking-wider truncate">
                    {card.card_number ? formatPan(card.card_number) : `•••• •••• •••• ${card.last_four}`}
                  </p>
                </div>
                {card.card_number && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copy("Card number", card.card_number!);
                    }}
                    className="p-1.5 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Expires</p>
                  <p className="font-mono">{expiry}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">CVV</p>
                  <p className="font-mono">{card.cvv ?? "•••"}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Limit</p>
                  <p className="font-mono">
                    ${Number(card.spending_limit).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              {isExternal && (
                <p className="text-[11px] opacity-70 pt-1">
                  Full details not stored — used for funding only.
                </p>
              )}
            </div>

            <p className="mt-auto text-[10px] uppercase tracking-widest opacity-60 text-center">
              Tap to flip back
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default FlipCard;
