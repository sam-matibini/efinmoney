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
import { ChartOfAccountsPanel } from "@/components/finance/ChartOfAccountsPanel";
import { JournalEntriesPanel } from "@/components/finance/JournalEntriesPanel";
import { CashFlowPanel } from "@/components/finance/CashFlowPanel";
import { BankAccountsPanel } from "@/components/finance/BankAccountsPanel";
import { BankTransactionsPanel } from "@/components/finance/BankTransactionsPanel";

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
            <p className="text-muted-foreground">Complete accounting & financial management</p>
          </div>

          <Tabs defaultValue="coa" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="coa">COA</TabsTrigger>
                <TabsTrigger value="journal">Journal</TabsTrigger>
                <TabsTrigger value="gl">GL</TabsTrigger>
                <TabsTrigger value="tb">TB</TabsTrigger>
                <TabsTrigger value="statements">Statements</TabsTrigger>
                <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
                <TabsTrigger value="bank-accounts">Banks</TabsTrigger>
                <TabsTrigger value="bank-txns">Bank Txns</TabsTrigger>
                <TabsTrigger value="reconciliation">Recon</TabsTrigger>
                <TabsTrigger value="fx">FX</TabsTrigger>
                <TabsTrigger value="crypto">Crypto</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="coa" className="space-y-4">
              <ChartOfAccountsPanel />
            </TabsContent>

            <TabsContent value="journal" className="space-y-4">
              <JournalEntriesPanel />
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

            <TabsContent value="cashflow" className="space-y-4">
              <CashFlowPanel />
            </TabsContent>

            <TabsContent value="bank-accounts" className="space-y-4">
              <BankAccountsPanel />
            </TabsContent>

            <TabsContent value="bank-txns" className="space-y-4">
              <BankTransactionsPanel />
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
