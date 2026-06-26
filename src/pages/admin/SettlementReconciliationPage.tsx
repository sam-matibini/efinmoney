import { SettlementReconciliationPanel } from "@/components/finance/SettlementReconciliationPanel";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function SettlementReconciliationPage() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6">
        <SettlementReconciliationPanel />
      </div>
    </AdminLayout>
  );
}
