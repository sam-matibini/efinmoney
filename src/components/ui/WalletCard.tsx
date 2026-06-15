import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  MoreHorizontal,
  Star,
  Snowflake,
  Play,
  Pencil,
  Trash2,
  Sparkles,
  FileText,
  CreditCard,
  ChevronDown,
  CheckCircle2,
  XCircle,
  PauseCircle,
} from "lucide-react";
import type { WalletLinkedCard } from "@/hooks/useWalletCards";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import TopUpModal from "@/components/modals/TopUpModal";
import ReceiveMoneyModal from "@/components/modals/ReceiveMoneyModal";
import StellarWalletModal from "@/components/modals/StellarWalletModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

interface WalletCardProps {
  walletId?: string;
  currency: string;
  balance: number;
  symbol: string;
  flag: string;
  change?: number;
  isMain?: boolean;
  isDefault?: boolean;
  status?: "active" | "frozen" | "suspended" | "closed";
  linkedCards?: WalletLinkedCard[];
  onSetDefault?: (walletId: string) => void;
  onToggleFreeze?: (walletId: string, freeze: boolean) => void;
  onEdit?: (wallet: { walletId: string; currency: string; balance: number; symbol: string; flag: string }) => void;
  onDelete?: (wallet: { walletId: string; currency: string; balance: number; symbol: string; flag: string }) => void;
  showStellarBadge?: boolean;
}

// SVG noise filter shared across cards
const NOISE_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>\")";

// Mesh gradient backgrounds per currency
const meshFor = (currency: string): string => {
  switch (currency.toUpperCase()) {
    case "USD":
      return `radial-gradient(120% 80% at 12% 8%, hsl(220 75% 32%) 0%, transparent 55%),
              radial-gradient(90% 70% at 88% 18%, hsl(245 70% 48%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(195 80% 38%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(225 60% 14%), hsl(240 55% 9%))`;
    case "CAD":
      return `radial-gradient(120% 80% at 10% 10%, hsl(0 75% 42%) 0%, transparent 55%),
              radial-gradient(90% 70% at 90% 20%, hsl(15 80% 52%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(345 70% 30%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(355 55% 18%), hsl(0 60% 10%))`;
    case "NGN":
      return `radial-gradient(120% 80% at 10% 10%, hsl(150 75% 32%) 0%, transparent 55%),
              radial-gradient(90% 70% at 90% 18%, hsl(165 80% 40%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(180 70% 28%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(160 55% 14%), hsl(170 60% 8%))`;
    case "EUR":
      return `radial-gradient(120% 80% at 10% 10%, hsl(230 75% 40%) 0%, transparent 55%),
              radial-gradient(90% 70% at 90% 18%, hsl(265 70% 50%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(280 65% 30%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(245 55% 16%), hsl(255 60% 9%))`;
    case "GBP":
      return `radial-gradient(120% 80% at 10% 10%, hsl(285 65% 38%) 0%, transparent 55%),
              radial-gradient(90% 70% at 90% 18%, hsl(320 65% 45%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(260 60% 28%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(290 50% 16%), hsl(285 55% 10%))`;
    default:
      return `radial-gradient(120% 80% at 10% 10%, hsl(258 70% 38%) 0%, transparent 55%),
              radial-gradient(90% 70% at 90% 18%, hsl(280 70% 48%) 0%, transparent 60%),
              radial-gradient(110% 80% at 70% 100%, hsl(220 70% 30%) 0%, transparent 60%),
              linear-gradient(135deg, hsl(250 50% 16%), hsl(255 55% 9%))`;
  }
};

const WalletCard = ({
  walletId,
  currency,
  balance,
  symbol,
  flag,
  change = 0,
  isMain = false,
  isDefault = false,
  status = "active",
  linkedCards = [],
  onSetDefault,
  onToggleFreeze,
  onEdit,
  onDelete,
  showStellarBadge = false,
}: WalletCardProps) => {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [stellarOpen, setStellarOpen] = useState(false);
  const [showLinkedCards, setShowLinkedCards] = useState(false);
  const navigate = useNavigate();

  const isFrozen = status === "frozen";
  const handleOpenStatement = () => {
    if (!walletId || isFrozen) return;
    navigate(`/wallets/${walletId}/statement`);
  };

  // 3D tilt + glare
  const cardRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 180, damping: 18 });
  const glareX = useTransform(mx, (v) => `${v * 100}%`);
  const glareY = useTransform(my, (v) => `${v * 100}%`);
  const glareOpacity = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const handleMouseEnter = () => glareOpacity.set(1);
  const handleMouseLeave = () => {
    mx.set(0.5);
    my.set(0.5);
    glareOpacity.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleOpenStatement}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformPerspective: 1000,
        transformStyle: "preserve-3d",
        backgroundImage: meshFor(currency),
      }}
      className={`group relative overflow-hidden rounded-2xl text-white shadow-[0_30px_60px_-20px_rgba(10,10,40,0.55)] ring-1 ring-white/10 aspect-[1.586/1] min-h-[200px] ${
        walletId && !isFrozen ? "cursor-pointer" : ""
      } ${isFrozen ? "opacity-80" : ""}`}
    >
      {/* Noise overlay */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-60"
        style={{ backgroundImage: NOISE_SVG, backgroundSize: "220px 220px" }}
      />

      {/* Soft inner highlight */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/30" />

      {/* Moving glare */}
      <motion.div
        className="pointer-events-none absolute -inset-px"
        style={{
          opacity: glareOpacity,
          background: useTransform(
            [glareX, glareY] as any,
            ([x, y]: any) =>
              `radial-gradient(420px circle at ${x} ${y}, rgba(255,255,255,0.28), rgba(255,255,255,0.05) 35%, transparent 60%)`
          ),
        }}
      />

      {/* Frozen overlay */}
      {isFrozen && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-full">
            <Snowflake className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Frozen</span>
          </div>
        </div>
      )}

      {/* Card content */}
      <div className="relative z-10 flex h-full flex-col p-5 sm:p-6" style={{ transform: "translateZ(40px)" }}>
        {/* Top row: currency + chip */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none drop-shadow-sm">{flag}</span>
            <div className="flex flex-col leading-tight">
              <span className="font-display font-semibold text-base tracking-wide">{currency}</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/60">Wallet</span>
            </div>
            {isDefault && (
              <span className="ml-1 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/15 text-white border border-white/15">
                <Star className="w-3 h-3 fill-current" />
                Default
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showStellarBadge && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStellarOpen(true);
                }}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/15 text-white border border-white/15 hover:bg-white/25 transition"
                title="View Stellar blockchain wallet"
              >
                <Sparkles className="w-3 h-3" />
                Chain
              </button>
            )}

            {/* EMV chip */}
            <div className="relative h-8 w-11 rounded-md overflow-hidden shadow-[0_4px_14px_rgba(255,200,80,0.35)] ring-1 ring-yellow-200/40">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(135deg, #f5d27a 0%, #c69a3a 35%, #8c6a1f 60%, #f6dd8a 100%)",
                }}
              />
              <div className="absolute inset-[3px] rounded-[3px] border border-yellow-900/30 grid grid-cols-3 grid-rows-3 gap-[1px] p-[2px]">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="bg-yellow-900/40 rounded-[1px]" />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent" />
            </div>

            {walletId && (onSetDefault || onToggleFreeze || onEdit || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4 text-white/80" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onSetDefault && !isDefault && (
                    <DropdownMenuItem onClick={() => onSetDefault(walletId)}>
                      <Star className="w-4 h-4 mr-2" />
                      Set as Default
                    </DropdownMenuItem>
                  )}
                  {onToggleFreeze && (
                    <DropdownMenuItem onClick={() => onToggleFreeze(walletId, !isFrozen)}>
                      {isFrozen ? (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Unfreeze Wallet
                        </>
                      ) : (
                        <>
                          <Snowflake className="w-4 h-4 mr-2" />
                          Freeze Wallet
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  {walletId && (
                    <DropdownMenuItem asChild>
                      <Link to={`/wallets/${walletId}/statement`}>
                        <FileText className="w-4 h-4 mr-2" />
                        View Statement
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {(onEdit || onDelete) && (onSetDefault || onToggleFreeze) && <DropdownMenuSeparator />}
                  {onEdit && (
                    <DropdownMenuItem
                      onClick={() => onEdit({ walletId, currency, balance, symbol, flag })}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Wallet
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => onDelete({ walletId, currency, balance, symbol, flag })}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Wallet
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Balance center */}
        <div className="flex-1 flex flex-col justify-center -mt-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/55 mb-1">Available Balance</p>
          <h2 className="text-3xl sm:text-[34px] font-display font-bold tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
            <AnimatedNumber value={balance} prefix={symbol} decimals={2} duration={1100} />
          </h2>
          {change !== 0 && (
            <p
              className={`text-xs mt-1 ${
                change > 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {change > 0 ? "+" : ""}
              {change.toFixed(2)}% today
            </p>
          )}
        </div>

        {/* Linked cards area */}
        {linkedCards.length > 0 && (
          <div className="relative z-10 mb-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowLinkedCards((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white border border-white/15 hover:bg-white/25 transition text-[10px] uppercase tracking-wider"
            >
              <CreditCard className="w-3 h-3" />
              {linkedCards.length} {linkedCards.length === 1 ? "card" : "cards"}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showLinkedCards ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {showLinkedCards && (
                <motion.div
                  initial={{ opacity: 0, y: -4, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  className="mt-1.5 space-y-1"
                >
                  {linkedCards.map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-[11px] text-white/90"
                    >
                      <StatusDot status={card.status} />
                      <span className="font-medium uppercase tracking-wider">{card.brand}</span>
                      {card.lastFour !== "••••" && (
                        <span className="font-mono opacity-70">•••• {card.lastFour}</span>
                      )}
                      <span className="ml-auto text-[9px] uppercase tracking-wider opacity-60">
                        {card.cardType}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Spacer for toolbar */}
        <div className={linkedCards.length > 0 && showLinkedCards ? "h-4" : "h-12"} />
      </div>

      {/* Frosted-glass action toolbar pinned to bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-around gap-1 px-2 py-2 backdrop-blur-xl bg-white/10 border-t border-white/15"
        style={{ transform: "translateZ(60px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <SendMoneyModal>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            disabled={isFrozen}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Send
          </motion.button>
        </SendMoneyModal>
        <div className="h-5 w-px bg-white/15" />
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.95 }}
          disabled={isFrozen || !walletId}
          onClick={(e) => {
            e.stopPropagation();
            if (walletId) setReceiveOpen(true);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          Receive
        </motion.button>
        <div className="h-5 w-px bg-white/15" />
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.95 }}
          disabled={isFrozen || !walletId}
          onClick={(e) => {
            e.stopPropagation();
            if (walletId) setTopUpOpen(true);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Top up
        </motion.button>
      </div>

      {walletId && (
        <ReceiveMoneyModal
          isOpen={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          wallet={{ walletId, currency, balance, symbol, flag }}
        />
      )}

      {walletId && (
        <TopUpModal
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
          defaultWalletId={walletId}
          title={`Top up ${currency} wallet`}
        />
      )}

      {showStellarBadge && <StellarWalletModal open={stellarOpen} onOpenChange={setStellarOpen} />}
    </motion.div>
  );
};

const StatusDot = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    active: "bg-emerald-400",
    frozen: "bg-amber-400",
    cancelled: "bg-red-400",
    pending: "bg-sky-400",
  };
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-400"}`}
      title={status}
    />
  );
};

export default WalletCard;
