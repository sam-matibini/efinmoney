import { Outlet } from "react-router-dom";
import * as Sentry from "@sentry/react";
import AdminGuard from "./AdminGuard";
import AdminLayout from "./AdminLayout";
import AdminErrorFallback from "./AdminErrorFallback";

export function AdminGuardShell() {
  return (
    <AdminGuard>
      <Sentry.ErrorBoundary fallback={<AdminErrorFallback />}>
        <Outlet />
      </Sentry.ErrorBoundary>
    </AdminGuard>
  );
}

export function AdminSidebarShell() {
  return (
    <AdminGuard>
      <AdminLayout>
        <Sentry.ErrorBoundary fallback={<AdminErrorFallback />}>
          <Outlet />
        </Sentry.ErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
