import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartOfAccountsPanel } from "@/components/finance/ChartOfAccountsPanel";
import { JournalEntriesPanel } from "@/components/finance/JournalEntriesPanel";
import { GeneralLedgerPanel } from "@/components/finance/GeneralLedgerPanel";
import { TrialBalancePanel } from "@/components/finance/TrialBalancePanel";

const AccountingDashboard = () => {
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
            <h1 className="text-2xl font-display font-bold text-foreground">Accounting</h1>
            <p className="text-muted-foreground">Chart of accounts, journal entries & ledger management</p>
          </div>

          <Tabs defaultValue="coa" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
                <TabsTrigger value="journal">Journal Entries</TabsTrigger>
                <TabsTrigger value="gl">General Ledger</TabsTrigger>
                <TabsTrigger value="tb">Trial Balance</TabsTrigger>
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
          </Tabs>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default AccountingDashboard;
