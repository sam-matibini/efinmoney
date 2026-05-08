import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin } from "lucide-react";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import DepositModal from "@/components/modals/DepositModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import PayBillsModal from "@/components/modals/PayBillsModal";
import SavingsModal from "@/components/modals/SavingsModal";

type Item =
  | { kind: "modal"; Modal: any; icon: any; label: string; color: string }
  | { kind: "link"; to: string; icon: any; label: string; color: string };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { kind: "link", to: "/send?mode=canada", icon: MapPin, label: "Domestic", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { kind: "modal", Modal: DepositModal, icon: Download, label: "Deposit", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { kind: "modal", Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { kind: "modal", Modal: PayBillsModal, icon: CreditCard, label: "Pay Bills", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { kind: "modal", Modal: SavingsModal, icon: PiggyBank, label: "Savings", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
];

const ButtonInner = ({ icon: Icon, label, color }: { icon: any; label: string; color: string }) => (
  <motion.div
    whileHover={{ y: -4 }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: "spring", stiffness: 380, damping: 18 }}
    className="flex flex-col items-center gap-2 cursor-pointer"
  >
    <div
      className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} shadow-sm transition-shadow group-hover:shadow-md`}
    >
      <Icon className="w-6 h-6" />
    </div>
    <span className="text-xs font-medium text-foreground whitespace-nowrap">{label}</span>
  </motion.div>
);

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
                  <ButtonInner icon={item.icon} label={item.label} color={item.color} />
                </div>
              </item.Modal>
            ) : (
              <Link to={item.to}>
                <ButtonInner icon={item.icon} label={item.label} color={item.color} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
