import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import FinanceDashboard from "./pages/FinanceDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import OperationsDashboard from "./pages/OperationsDashboard";
import SettingsDashboard from "./pages/SettingsDashboard";
import WalletsPage from "./pages/WalletsPage";
import SendPage from "./pages/SendPage";
import ExchangePage from "./pages/ExchangePage";
import CardsPage from "./pages/CardsPage";
import CustomerPortalPage from "./pages/CustomerPortalPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import KYCPage from "./pages/KYCPage";
import SecurityPage from "./pages/SecurityPage";
import DepositComplete from "./pages/DepositComplete";
import TransferTrackingPage from "./pages/TransferTrackingPage";
import TransfersListPage from "./pages/TransfersListPage";
import ContactsPage from "./pages/ContactsPage";
import CanadaTransferPage from "./pages/CanadaTransferPage";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const RoleProtectedRoute = ({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles: ('admin' | 'finance' | 'compliance')[];
}) => {
  const { user, loading } = useAuth();
  const { roles, isLoading: rolesLoading } = useUserRoles();

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasAccess = allowedRoles.some(role => roles.includes(role));
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Index />
        </ProtectedRoute>
      }
    />
    <Route
      path="/wallets"
      element={
        <ProtectedRoute>
          <WalletsPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/send"
      element={
        <ProtectedRoute>
          <SendPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/exchange"
      element={
        <ProtectedRoute>
          <ExchangePage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/cards"
      element={
        <ProtectedRoute>
          <CardsPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/finance"
      element={
        <RoleProtectedRoute allowedRoles={['admin', 'finance']}>
          <FinanceDashboard />
        </RoleProtectedRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <RoleProtectedRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </RoleProtectedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <RoleProtectedRoute allowedRoles={['admin']}>
          <SettingsDashboard />
        </RoleProtectedRoute>
      }
    />
    <Route
      path="/operations"
      element={
        <RoleProtectedRoute allowedRoles={['admin', 'compliance', 'finance']}>
          <OperationsDashboard />
        </RoleProtectedRoute>
      }
    />
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <Auth />
        </PublicRoute>
      }
    />
    <Route
      path="/portal"
      element={<CustomerPortalPage />}
    />
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <ProfileSettingsPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/kyc"
      element={
        <ProtectedRoute>
          <KYCPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/security"
      element={
        <ProtectedRoute>
          <SecurityPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/transfers"
      element={
        <ProtectedRoute>
          <TransfersListPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/transfers/:id"
      element={
        <ProtectedRoute>
          <TransferTrackingPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/contacts"
      element={
        <ProtectedRoute>
          <ContactsPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/transfers/canada"
      element={
        <ProtectedRoute>
          <CanadaTransferPage />
        </ProtectedRoute>
      }
    />
    <Route path="/deposit/complete" element={<DepositComplete />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
