import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FxTradesPanel } from "@/components/finance/FxTradesPanel";
import { CryptoTradesPanel } from "@/components/finance/CryptoTradesPanel";
import { StatementsPanel } from "@/components/finance/StatementsPanel";
import { VendorsPanel } from "@/components/finance/VendorsPanel";
import { SalesInvoicesPanel } from "@/components/finance/SalesInvoicesPanel";
import { PurchaseBillsPanel } from "@/components/finance/PurchaseBillsPanel";

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
            <p className="text-muted-foreground">Financial statements, trading & payables/receivables</p>
          </div>

          <Tabs defaultValue="statements" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="statements">Statements</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="bills">Bills</TabsTrigger>
                <TabsTrigger value="fx">FX</TabsTrigger>
                <TabsTrigger value="crypto">Crypto</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="statements" className="space-y-4">
              <StatementsPanel />
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
