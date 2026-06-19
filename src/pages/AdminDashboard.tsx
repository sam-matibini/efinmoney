import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { ComplianceAlertsPanel } from "@/components/admin/ComplianceAlertsPanel";
import { ComplianceRulesPanel } from "@/components/admin/ComplianceRulesPanel";
import { AuditLogsPanel } from "@/components/admin/AuditLogsPanel";
import { StaffManagementPanel } from "@/components/admin/StaffManagementPanel";
import { RiskTiersPanel } from "@/components/admin/RiskTiersPanel";

const AdminDashboard = () => {
  return (
    <main className="container px-4 py-6 pb-24 md:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage users, compliance, and system settings</p>
          </div>

          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="staff">Staff Roles</TabsTrigger>
              <TabsTrigger value="tiers">Risk Tiers</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4">
              <UsersPanel />
            </TabsContent>

            <TabsContent value="staff" className="space-y-4">
              <StaffManagementPanel />
            </TabsContent>

            <TabsContent value="tiers" className="space-y-4">
              <RiskTiersPanel />
            </TabsContent>

            <TabsContent value="alerts" className="space-y-4">
              <ComplianceAlertsPanel />
            </TabsContent>

            <TabsContent value="rules" className="space-y-4">
              <ComplianceRulesPanel />
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <AuditLogsPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
    </main>
  );
};

export default AdminDashboard;
