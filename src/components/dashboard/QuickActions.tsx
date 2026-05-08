import { motion } from "framer-motion";
import { Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank } from "lucide-react";
import QuickAction from "@/components/ui/QuickAction";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import DepositModal from "@/components/modals/DepositModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import PayBillsModal from "@/components/modals/PayBillsModal";
import SavingsModal from "@/components/modals/SavingsModal";

const items = [
  { Modal: SendMoneyModal, icon: Send, label: "Send Money", variant: "primary" as const },
  { Modal: DepositModal, icon: Download, label: "Deposit", variant: "default" as const },
  { Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", variant: "default" as const },
  { Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile Money", variant: "accent" as const },
  { Modal: PayBillsModal, icon: CreditCard, label: "Pay Bills", variant: "default" as const },
  { Modal: SavingsModal, icon: PiggyBank, label: "Savings", variant: "default" as const },
];

const QuickActions = () => {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-display font-semibold text-foreground mb-4">Quick Actions</h2>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        {items.map(({ Modal, icon, label, variant }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
            className="hover-lift rounded-2xl"
          >
            <Modal>
              <div><QuickAction icon={icon} label={label} variant={variant} /></div>
            </Modal>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
