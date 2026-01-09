import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartOfAccountsPanel } from "@/components/finance/ChartOfAccountsPanel";
import { JournalEntriesPanel } from "@/components/finance/JournalEntriesPanel";
import { GeneralLedgerPanel } from "@/components/finance/GeneralLedgerPanel";
import { TrialBalancePanel } from "@/components/finance/TrialBalancePanel";
import { BankAccountsPanel } from "@/components/finance/BankAccountsPanel";
import { BankTransactionsPanel } from "@/components/finance/BankTransactionsPanel";
import { ReconciliationPanel } from "@/components/finance/ReconciliationPanel";
import { FxTradesPanel } from "@/components/finance/FxTradesPanel";
import { CryptoTradesPanel } from "@/components/finance/CryptoTradesPanel";
import { StatementsPanel } from "@/components/finance/StatementsPanel";
import { VendorsPanel } from "@/components/finance/VendorsPanel";
import { SalesInvoicesPanel } from "@/components/finance/SalesInvoicesPanel";
import { PurchaseBillsPanel } from "@/components/finance/PurchaseBillsPanel";
import { ReportsCentrePanel } from "@/components/finance/ReportsCentrePanel";

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
            <p className="text-muted-foreground">Accounting, banking & financial management</p>
          </div>

          <Tabs defaultValue="accounting" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
              <TabsTrigger value="accounting">Accounting</TabsTrigger>
              <TabsTrigger value="banking">Banking</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="fx">FX</TabsTrigger>
              <TabsTrigger value="crypto">Crypto</TabsTrigger>
            </TabsList>
            </div>

            <TabsContent value="accounting" className="space-y-4">
              <Tabs defaultValue="coa" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
                  <TabsTrigger value="journal">Journal Entries</TabsTrigger>
                  <TabsTrigger value="gl">General Ledger</TabsTrigger>
                  <TabsTrigger value="tb">Trial Balance</TabsTrigger>
                </TabsList>
                <TabsContent value="coa">
                  <ChartOfAccountsPanel />
                </TabsContent>
                <TabsContent value="journal">
                  <JournalEntriesPanel />
                </TabsContent>
                <TabsContent value="gl">
                  <GeneralLedgerPanel />
                </TabsContent>
                <TabsContent value="tb">
                  <TrialBalancePanel />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="banking" className="space-y-4">
              <Tabs defaultValue="accounts" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
                </TabsList>
                <TabsContent value="accounts">
                  <BankAccountsPanel />
                </TabsContent>
                <TabsContent value="transactions">
                  <BankTransactionsPanel />
                </TabsContent>
                <TabsContent value="reconciliation">
                  <ReconciliationPanel />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <ReportsCentrePanel />
            </TabsContent>

            <TabsContent value="vendors" className="space-y-4">
              <VendorsPanel />
            </TabsContent>

            <TabsContent value="invoices" className="space-y-4">
              <SalesInvoicesPanel />
            </TabsContent>

            <TabsContent value="bills" className="space-y-4">
              <PurchaseBillsPanel />
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
