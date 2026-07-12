import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingSettingsPanel } from "@/components/settings/PricingSettingsPanel";
import { ModuleAccessPanel } from "@/components/settings/ModuleAccessPanel";
import { SystemSettingsPanel } from "@/components/settings/SystemSettingsPanel";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { CurrencyManagementPanel } from "@/components/settings/CurrencyManagementPanel";
import { CircleCpnConfigPanel } from "@/components/settings/CircleCpnConfigPanel";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { Settings, Plug, SlidersHorizontal } from "lucide-react";

const SettingsDashboard = () => {
  return (
    <AppPage width="wide">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">System configuration, pricing, and access controls</p>
          </div>

          <PageHeroBanner
            icon={Settings}
            label="Platform configuration"
            value="Admin settings"
            meta={[
              { icon: SlidersHorizontal, text: "Pricing, modules & currencies" },
              { icon: Plug, text: "Payment rails & integration status" },
            ]}
            variant="accent"
          />

          <Tabs defaultValue="pricing" className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
                <TabsTrigger value="pricing">Pricing & Fees</TabsTrigger>
                <TabsTrigger value="currencies">Currencies</TabsTrigger>
                <TabsTrigger value="modules">Module Access</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
                <TabsTrigger value="circle_cpn">Circle CPN</TabsTrigger>
                <TabsTrigger value="system">System Settings</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pricing" className="space-y-4">
              <PricingSettingsPanel />
            </TabsContent>

            <TabsContent value="currencies" className="space-y-4">
              <CurrencyManagementPanel />
            </TabsContent>

            <TabsContent value="modules" className="space-y-4">
              <ModuleAccessPanel />
            </TabsContent>

            <TabsContent value="integrations" className="space-y-4">
              <IntegrationsPanel />
            </TabsContent>

            <TabsContent value="circle_cpn" className="space-y-4">
              <CircleCpnConfigPanel />
            </TabsContent>

            <TabsContent value="system" className="space-y-4">
              <SystemSettingsPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
    </AppPage>
  );
};

export default SettingsDashboard;
