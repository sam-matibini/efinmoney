import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerEntriesPanel } from "@/components/finance/LedgerEntriesPanel";
import { ReconciliationPanel } from "@/components/finance/ReconciliationPanel";
import { FxTradesPanel } from "@/components/finance/FxTradesPanel";
import { CryptoTradesPanel } from "@/components/finance/CryptoTradesPanel";
import { TrialBalancePanel } from "@/components/finance/TrialBalancePanel";
import { GeneralLedgerPanel } from "@/components/finance/GeneralLedgerPanel";
import { FinancialStatementsPanel } from "@/components/finance/FinancialStatementsPanel";

const FinanceDashboard = () => {
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
            <h1 className="text-2xl font-display font-bold text-foreground">Finance Dashboard</h1>
            <p className="text-muted-foreground">Manage ledger, reconciliation, trades, and financial reports</p>
          </div>

          <Tabs defaultValue="ledger" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 lg:w-auto lg:inline-flex">
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="gl">GL</TabsTrigger>
              <TabsTrigger value="tb">Trial Balance</TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
              <TabsTrigger value="reconciliation">Recon</TabsTrigger>
              <TabsTrigger value="fx">FX</TabsTrigger>
              <TabsTrigger value="crypto">Crypto</TabsTrigger>
            </TabsList>

            <TabsContent value="ledger" className="space-y-4">
              <LedgerEntriesPanel />
            </TabsContent>

            <TabsContent value="gl" className="space-y-4">
              <GeneralLedgerPanel />
            </TabsContent>

            <TabsContent value="tb" className="space-y-4">
              <TrialBalancePanel />
            </TabsContent>

            <TabsContent value="statements" className="space-y-4">
              <FinancialStatementsPanel />
            </TabsContent>

            <TabsContent value="reconciliation" className="space-y-4">
              <ReconciliationPanel />
            </TabsContent>

            <TabsContent value="fx" className="space-y-4">
              <FxTradesPanel />
            </TabsContent>

            <TabsContent value="crypto" className="space-y-4">
              <CryptoTradesPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default FinanceDashboard;
