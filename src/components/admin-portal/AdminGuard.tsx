import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { user, admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size={24} />
      </div>
    );
  }

  if (!user || !admin) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default AdminGuard;
