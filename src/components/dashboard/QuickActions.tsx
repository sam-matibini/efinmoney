import { motion } from "framer-motion";
import { Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank } from "lucide-react";
import QuickAction from "@/components/ui/QuickAction";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import DepositModal from "@/components/modals/DepositModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import PayBillsModal from "@/components/modals/PayBillsModal";
import SavingsModal from "@/components/modals/SavingsModal";

const QuickActions = () => {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-display font-semibold text-foreground mb-4">Quick Actions</h2>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3"
      >
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0 }}>
          <SendMoneyModal>
            <div><QuickAction icon={Send} label="Send Money" variant="primary" /></div>
          </SendMoneyModal>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}>
          <DepositModal>
            <div><QuickAction icon={Download} label="Deposit" variant="default" /></div>
          </DepositModal>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <ExchangeModal>
            <div><QuickAction icon={RefreshCw} label="Exchange" variant="default" /></div>
          </ExchangeModal>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
          <MobileMoneyModal>
            <div><QuickAction icon={Smartphone} label="Mobile Money" variant="accent" /></div>
          </MobileMoneyModal>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <PayBillsModal>
            <div><QuickAction icon={CreditCard} label="Pay Bills" variant="default" /></div>
          </PayBillsModal>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
          <SavingsModal>
            <div><QuickAction icon={PiggyBank} label="Savings" variant="default" /></div>
          </SavingsModal>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default QuickActions;
