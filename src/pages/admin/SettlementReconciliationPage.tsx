import { SettlementReconciliationPanel } from "@/components/finance/SettlementReconciliationPanel";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function SettlementReconciliationPage() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settlement Reconciliation</h1>
        <p className="text-muted-foreground">Three-way settlement matching — processor, ledger, and bank statement</p>
      </div>
      <SettlementReconciliationPanel />
    </div>
    </AdminLayout>
  );
}
