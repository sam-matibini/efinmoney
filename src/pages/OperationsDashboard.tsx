import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrmCustomersPanel } from "@/components/crm/CrmCustomersPanel";
import { TransactionMonitoringPanel } from "@/components/operations/TransactionMonitoringPanel";
import { IncidentsPanel } from "@/components/operations/IncidentsPanel";
import { FraudSignalsPanel } from "@/components/operations/FraudSignalsPanel";
import { DisputesPanel } from "@/components/operations/DisputesPanel";
import { WalletOperationsPanel } from "@/components/operations/WalletOperationsPanel";
import { OperationsKPIsPanel } from "@/components/operations/OperationsKPIsPanel";
import { RegulatoryReportsPanel } from "@/components/operations/RegulatoryReportsPanel";
import { CommunicationsPanel } from "@/components/operations/CommunicationsPanel";
import { MakerCheckerPanel } from "@/components/operations/MakerCheckerPanel";
import { ProviderStatusPanel } from "@/components/operations/ProviderStatusPanel";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { Activity, Users, AlertTriangle } from "lucide-react";

const OperationsDashboard = () => {
  return (
    <AppPage width="wide">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Operations Dashboard</h1>
            <p className="text-muted-foreground">CRM, transaction monitoring, disputes, compliance & operational controls</p>
          </div>

          <PageHeroBanner
            icon={Activity}
            label="Operations hub"
            value="Monitor & respond"
            meta={[
              { icon: Users, text: "CRM, wallet ops & customer comms" },
              { icon: AlertTriangle, text: "Incidents, fraud signals & disputes" },
            ]}
            variant="hero"
          />


          <ProviderStatusPanel />

          <Tabs defaultValue="crm" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="crm">CRM</TabsTrigger>
                <TabsTrigger value="txn-monitor">Transactions</TabsTrigger>
                <TabsTrigger value="disputes">Disputes</TabsTrigger>
                <TabsTrigger value="wallet-ops">Wallet Ops</TabsTrigger>
                <TabsTrigger value="comms">Communications</TabsTrigger>
                <TabsTrigger value="reg-reports">Regulatory</TabsTrigger>
                <TabsTrigger value="maker-checker">Approvals</TabsTrigger>
                <TabsTrigger value="incidents">Incidents</TabsTrigger>
                <TabsTrigger value="fraud">Fraud</TabsTrigger>
                <TabsTrigger value="kpis">KPIs</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="crm" className="space-y-4">
              <CrmCustomersPanel />
            </TabsContent>

            <TabsContent value="txn-monitor" className="space-y-4">
              <TransactionMonitoringPanel />
            </TabsContent>

            <TabsContent value="disputes" className="space-y-4">
              <DisputesPanel />
            </TabsContent>

            <TabsContent value="wallet-ops" className="space-y-4">
              <WalletOperationsPanel />
            </TabsContent>

            <TabsContent value="comms" className="space-y-4">
              <CommunicationsPanel />
            </TabsContent>

            <TabsContent value="reg-reports" className="space-y-4">
              <RegulatoryReportsPanel />
            </TabsContent>

            <TabsContent value="maker-checker" className="space-y-4">
              <MakerCheckerPanel />
            </TabsContent>

            <TabsContent value="incidents" className="space-y-4">
              <IncidentsPanel />
            </TabsContent>

            <TabsContent value="fraud" className="space-y-4">
              <FraudSignalsPanel />
            </TabsContent>

            <TabsContent value="kpis" className="space-y-4">
              <OperationsKPIsPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
    </AppPage>
  );
};

export default OperationsDashboard;
