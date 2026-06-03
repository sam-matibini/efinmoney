import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin } from "lucide-react";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import SavingsModal from "@/components/modals/SavingsModal";

type Item =
  | { kind: "modal"; Modal: any; icon: any; label: string; color: string }
  | { kind: "link"; to: string; icon: any; label: string; color: string };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send", color: "bg-primary/15 text-primary" },
  { kind: "link", to: "/wallet/topup", icon: Download, label: "Add Money", color: "bg-primary/10 text-primary" },
  { kind: "link", to: "/wallet/receive", icon: Smartphone, label: "Receive", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { kind: "link", to: "/pay-bills", icon: CreditCard, label: "Pay Bills", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { kind: "link", to: "/send?mode=canada", icon: MapPin, label: "Domestic", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { kind: "modal", Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { kind: "modal", Modal: SavingsModal, icon: PiggyBank, label: "Savings", color: "bg-primary/10 text-primary" },
];

const ICON_VARIANTS: Record<string, any> = {
  Send: { rest: { x: 0, rotate: 0 }, hover: { x: 3, rotate: -8 } },
  Exchange: { rest: { rotate: 0 }, hover: { rotate: 180 } },
  Deposit: { rest: { y: 0 }, hover: { y: 3 } },
  Domestic: { rest: { scale: 1 }, hover: { scale: 1.15 } },
};

const ButtonInner = ({ icon: Icon, label, color, badge }: { icon: any; label: string; color: string; badge?: string }) => {
  const variant = ICON_VARIANTS[label] || { rest: { y: 0 }, hover: { y: -2 } };
  return (
    <motion.div
      whileHover="hover"
      initial="rest"
      animate="rest"
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className="flex flex-col items-center gap-2 cursor-pointer"
    >
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center ${color} shadow-sm transition-all group-hover:shadow-md group-hover:bg-gradient-to-br group-hover:from-primary/20 group-hover:to-primary/5 overflow-hidden`}
      >
        <motion.span variants={variant} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="inline-flex">
          <Icon className="w-6 h-6" />
        </motion.span>
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center ring-2 ring-background animate-pulse">
            {badge}
          </span>
        )}
        {/* ripple on tap */}
        <span className="ripple-host absolute inset-0" />
      </div>
      <span className="text-xs font-medium text-foreground whitespace-nowrap">{label}</span>
    </motion.div>
  );
};

const QuickActions = () => {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-display font-semibold text-foreground mb-4">Quick Actions</h2>

      <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group shrink-0"
          >
            {item.kind === "modal" ? (
              <item.Modal>
                <div>
                  <ButtonInner icon={item.icon} label={item.label} color={item.color} badge={item.label === "Mobile" ? "!" : undefined} />
                </div>
              </item.Modal>
            ) : (
              <Link to={item.to}>
                <ButtonInner icon={item.icon} label={item.label} color={item.color} badge={item.label === "Mobile" ? "!" : undefined} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
