import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { user, admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !admin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default AdminGuard;
