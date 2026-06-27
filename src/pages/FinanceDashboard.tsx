import { useState } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartOfAccountsPanel } from "@/components/finance/ChartOfAccountsPanel";
import { JournalEntriesPanel } from "@/components/finance/JournalEntriesPanel";
import { GeneralLedgerPanel } from "@/components/finance/GeneralLedgerPanel";
import { TrialBalancePanel } from "@/components/finance/TrialBalancePanel";
import { BankAccountsPanel } from "@/components/finance/BankAccountsPanel";
import { BankTransactionsPanel } from "@/components/finance/BankTransactionsPanel";
import { ReconciliationPanel } from "@/components/finance/ReconciliationPanel";
import { TransactionRulesPanel } from "@/components/finance/TransactionRulesPanel";
import { FxTradesPanel } from "@/components/finance/FxTradesPanel";
import { CryptoTradesPanel } from "@/components/finance/CryptoTradesPanel";
import { FinancialStatementsPanel } from "@/components/finance/FinancialStatementsPanel";
import { VendorsPanel } from "@/components/finance/VendorsPanel";
import { SalesInvoicesPanel } from "@/components/finance/SalesInvoicesPanel";
import { PurchaseBillsPanel } from "@/components/finance/PurchaseBillsPanel";
import { PurchaseOrdersPanel } from "@/components/finance/purchases/PurchaseOrdersPanel";
import { ExpenseClaimsPanel } from "@/components/finance/purchases/ExpenseClaimsPanel";
import { ReportsCentrePanel } from "@/components/finance/ReportsCentrePanel";
import { SalesTaxPanel } from "@/components/finance/SalesTaxPanel";
import { TreasuryPanel } from "@/components/finance/treasury/TreasuryPanel";
import { TreasuryWorkerPanel } from "@/components/finance/treasury/TreasuryWorkerPanel";
import { SafeguardingPanel } from "@/components/finance/SafeguardingPanel";
import { UnclaimedFundsPanel } from "@/components/finance/UnclaimedFundsPanel";
import { SettlementReconciliationPanel } from "@/components/finance/SettlementReconciliationPanel";
import { PeriodEndControlsPanel } from "@/components/finance/PeriodEndControlsPanel";
import { EvidenceRepositoryPanel } from "@/components/finance/EvidenceRepositoryPanel";

const FinanceDashboard = () => {
  const [accountingTab, setAccountingTab] = useState("coa");
  const [glAccountId, setGlAccountId] = useState<string | undefined>(undefined);

  const viewLedgerForAccount = (accountId: string) => {
    setGlAccountId(accountId);
    setAccountingTab("gl");
  };
  return (
    <main className="container px-4 py-6 pb-24 md:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Finance Dashboard</h1>
            <p className="text-muted-foreground">Accounting, banking & financial management</p>
          </div>

          <Tabs defaultValue="accounting" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
              <TabsTrigger value="accounting">Accounting</TabsTrigger>
              <TabsTrigger value="banking">Banking</TabsTrigger>
              <TabsTrigger value="safeguarding">Safeguarding</TabsTrigger>
              <TabsTrigger value="treasury">Treasury</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="sales-tax">Sales Tax</TabsTrigger>
              
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="fx">FX</TabsTrigger>
              <TabsTrigger value="period-close">Period Close</TabsTrigger>
              <TabsTrigger value="settlement">Settlement</TabsTrigger>
              <TabsTrigger value="unclaimed">Unclaimed Funds</TabsTrigger>
              <TabsTrigger value="crypto">Crypto</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
            </TabsList>
            </div>

            <TabsContent value="accounting" className="space-y-4">
              <Tabs value={accountingTab} onValueChange={setAccountingTab} className="space-y-4">
                <TabsList>
                  <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
                  <TabsTrigger value="journal">Journal Entries</TabsTrigger>
                  <TabsTrigger value="gl">General Ledger</TabsTrigger>
                  <TabsTrigger value="tb">Trial Balance</TabsTrigger>
                </TabsList>
                <TabsContent value="coa">
                  <ChartOfAccountsPanel onViewLedger={viewLedgerForAccount} />
                </TabsContent>
                <TabsContent value="journal">
                  <JournalEntriesPanel />
                </TabsContent>
                <TabsContent value="gl">
                  <GeneralLedgerPanel initialAccountId={glAccountId} />
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
                  <TabsTrigger value="rules">Transaction Rules</TabsTrigger>
                  <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
                </TabsList>
                <TabsContent value="accounts">
                  <BankAccountsPanel />
                </TabsContent>
                <TabsContent value="transactions">
                  <BankTransactionsPanel />
                </TabsContent>
                <TabsContent value="rules">
                  <TransactionRulesPanel />
                </TabsContent>
                <TabsContent value="reconciliation">
                  <ReconciliationPanel />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="safeguarding" className="space-y-4">
              <SafeguardingPanel />
            </TabsContent>

            <TabsContent value="treasury" className="space-y-4">
              <Tabs defaultValue="worker" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="worker">Settlement Worker</TabsTrigger>
                  <TabsTrigger value="stripe-fa">Stripe Treasury</TabsTrigger>
                </TabsList>
                <TabsContent value="worker">
                  <TreasuryWorkerPanel />
                </TabsContent>
                <TabsContent value="stripe-fa">
                  <TreasuryPanel />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <Tabs defaultValue="statements" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="statements">Financial Statements</TabsTrigger>
                  <TabsTrigger value="centre">Reports Centre</TabsTrigger>
                </TabsList>
                <TabsContent value="statements">
                  <FinancialStatementsPanel />
                </TabsContent>
                <TabsContent value="centre">
                  <ReportsCentrePanel />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="sales-tax" className="space-y-4">
              <SalesTaxPanel />
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

            <TabsContent value="period-close" className="space-y-4">
              <PeriodEndControlsPanel />
            </TabsContent>

            <TabsContent value="settlement" className="space-y-4">
              <SettlementReconciliationPanel />
            </TabsContent>

            <TabsContent value="unclaimed" className="space-y-4">
              <UnclaimedFundsPanel />
            </TabsContent>

            <TabsContent value="crypto" className="space-y-4">
              <CryptoTradesPanel />
            </TabsContent>

            <TabsContent value="evidence" className="space-y-4">
              <EvidenceRepositoryPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
    </main>
  );
};

export default FinanceDashboard;
