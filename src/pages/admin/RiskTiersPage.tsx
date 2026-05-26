import AdminLayout from "@/components/admin-portal/AdminLayout";
import { RiskTiersPanel } from "@/components/admin/RiskTiersPanel";

const RiskTiersPage = () => (
  <AdminLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Risk Tiers</h1>
        <p className="text-sm text-muted-foreground">User tier distribution and per-user transaction limits</p>
      </div>
      <RiskTiersPanel />
    </div>
  </AdminLayout>
);

export default RiskTiersPage;
