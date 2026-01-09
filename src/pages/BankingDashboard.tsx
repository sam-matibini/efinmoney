import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountsPanel } from "@/components/finance/BankAccountsPanel";
import { BankTransactionsPanel } from "@/components/finance/BankTransactionsPanel";
import { ReconciliationPanel } from "@/components/finance/ReconciliationPanel";

const BankingDashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container px-4 py-6 pb-24 md:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Banking</h1>
            <p className="text-muted-foreground">Bank accounts, transactions & reconciliation</p>
          </div>

          <Tabs defaultValue="accounts" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="accounts" className="space-y-4">
              <BankAccountsPanel />
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <BankTransactionsPanel />
            </TabsContent>

            <TabsContent value="reconciliation" className="space-y-4">
              <ReconciliationPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default BankingDashboard;
