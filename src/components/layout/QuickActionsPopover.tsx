import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LayoutGrid, Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import SavingsModal from "@/components/modals/SavingsModal";
import {
  headerIconBase,
  headerIconBreathe,
  headerIconInteractive,
  headerIconVariants,
  quickActionTileTones,
} from "@/components/layout/headerStyles";

type Item =
  | { kind: "modal"; Modal: React.ComponentType<{ children: React.ReactNode }>; icon: LucideIcon; label: string }
  | { kind: "link"; to: string; icon: LucideIcon; label: string };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send" },
  { kind: "link", to: "/wallet/topup", icon: Download, label: "Add Money" },
  { kind: "link", to: "/wallet/receive", icon: Smartphone, label: "Bank account" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange" },
];

const QuickActionsPopover = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.08, y: -1, rotate: 90 }}
          whileTap={{ scale: 0.9, rotate: 0 }}
          transition={{ type: "spring", stiffness: 480, damping: 20 }}
          className={`${headerIconBase} ${headerIconInteractive} ${headerIconVariants.quickActions} ${headerIconBreathe}`}
          aria-label="Quick Actions"
        >
          <LayoutGrid className="w-5 h-5" />
        </motion.button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <motion.div
          className="grid grid-cols-4 gap-1"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {items.map((item) => {
            const tone = quickActionTileTones[item.label] ?? quickActionTileTones.Send;
            const tileMotion = {
              hidden: { opacity: 0, y: 8, scale: 0.9 },
              show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 420, damping: 24 } },
            };
            return item.kind === "modal" ? (
              <item.Modal key={item.label}>
                <motion.div
                  variants={tileMotion}
                  whileHover={{ y: -3, scale: 1.04 }}
                  className="group flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer header-hover-lift"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 ${tone}`}>
                    <item.icon className="w-4 h-4 header-hover-icon" />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight text-[hsl(230,18%,38%)] dark:text-[hsl(230,12%,72%)] group-hover:text-foreground">
                    {item.label}
                  </span>
                </motion.div>
              </item.Modal>
            ) : (
              <motion.div key={item.label} variants={tileMotion} whileHover={{ y: -3, scale: 1.04 }}>
              <Link
                to={item.to}
                className="group flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/50 transition-colors header-hover-lift"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 ${tone}`}>
                  <item.icon className="w-4 h-4 header-hover-icon" />
                </div>
                <span className="text-[10px] font-medium text-center leading-tight text-[hsl(230,18%,38%)] dark:text-[hsl(230,12%,72%)] group-hover:text-foreground">
                  {item.label}
                </span>
              </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickActionsPopover;
