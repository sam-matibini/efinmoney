import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin } from "lucide-react";
import QuickAction from "@/components/ui/QuickAction";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import DepositModal from "@/components/modals/DepositModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import PayBillsModal from "@/components/modals/PayBillsModal";
import SavingsModal from "@/components/modals/SavingsModal";

type Item =
  | { kind: "modal"; Modal: any; icon: any; label: string; variant: "primary" | "default" | "accent" }
  | { kind: "link"; to: string; icon: any; label: string; variant: "primary" | "default" | "accent" };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send Money", variant: "primary" },
  { kind: "link", to: "/send?mode=canada", icon: MapPin, label: "🇨🇦 Send in Canada", variant: "accent" },
  { kind: "modal", Modal: DepositModal, icon: Download, label: "Deposit", variant: "default" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", variant: "default" },
  { kind: "modal", Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile Money", variant: "default" },
  { kind: "modal", Modal: PayBillsModal, icon: CreditCard, label: "Pay Bills", variant: "default" },
  { kind: "modal", Modal: SavingsModal, icon: PiggyBank, label: "Savings", variant: "default" },
];

const QuickActions = () => {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-display font-semibold text-foreground mb-4">Quick Actions</h2>

      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
            className="hover-lift rounded-2xl"
          >
            {item.kind === "modal" ? (
              <item.Modal>
                <div><QuickAction icon={item.icon} label={item.label} variant={item.variant} /></div>
              </item.Modal>
            ) : (
              <Link to={item.to} className="block">
                <QuickAction icon={item.icon} label={item.label} variant={item.variant} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
