import AdminLayout from "@/components/admin-portal/AdminLayout";
import { AuditLogsPanel } from "@/components/admin/AuditLogsPanel";

const AuditLogPage = () => (
  <AdminLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Complete audit trail of administrative and system actions</p>
      </div>
      <AuditLogsPanel />
    </div>
  </AdminLayout>
);

export default AuditLogPage;
