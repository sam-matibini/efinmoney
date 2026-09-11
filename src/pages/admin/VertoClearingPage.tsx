import AdminLayout from "@/components/admin-portal/AdminLayout";
import { VertoClearingPanel } from "@/components/finance/VertoClearingPanel";

export default function VertoClearingPage() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Verto clearing</h1>
          <p className="text-muted-foreground">
            Corporate flow of funds between eFinMoney and payment partners — FX, V-Pay, and bank payouts.
          </p>
        </div>
        <VertoClearingPanel />
      </div>
    </AdminLayout>
  );
}
