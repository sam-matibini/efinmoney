import { Outlet } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminGuard from "./AdminGuard";
import AdminLayout from "./AdminLayout";
import AdminErrorFallback from "./AdminErrorFallback";

export function AdminGuardShell() {
  return (
    <AdminAuthProvider>
      <AdminGuard>
        <Sentry.ErrorBoundary fallback={<AdminErrorFallback />}>
          <Outlet />
        </Sentry.ErrorBoundary>
      </AdminGuard>
    </AdminAuthProvider>
  );
}

export function AdminSidebarShell() {
  return (
    <AdminAuthProvider>
      <AdminGuard>
        <AdminLayout>
          <Sentry.ErrorBoundary fallback={<AdminErrorFallback />}>
            <Outlet />
          </Sentry.ErrorBoundary>
        </AdminLayout>
      </AdminGuard>
    </AdminAuthProvider>
  );
}
