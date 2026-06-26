import { EvidenceRepositoryPanel } from "@/components/finance/EvidenceRepositoryPanel";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function EvidenceRepositoryPage() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Evidence Repository</h1>
        <p className="text-muted-foreground">7-year retention archive — KYC, AML, STR, audit, and board-approval records</p>
      </div>
      <EvidenceRepositoryPanel />
    </div>
    </AdminLayout>
  );
}
