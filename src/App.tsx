import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import { useEffect, Suspense } from "react";
import { lazyImport } from "@/lib/lazyImport";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppBootstrap, useAppSession } from "@/providers/AppBootstrap";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import SplashScreen from "@/components/SplashScreen";
import GatedPage from "@/components/common/GatedPage";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Core nav pages — eager so tab switches never wait on chunks
import Index from "./pages/Index";
import WalletsPage from "./pages/WalletsPage";
import SendPage from "./pages/SendPage";
import ExchangePage from "./pages/ExchangePage";
import CardsPage from "./pages/CardsPage";
import ContactsPage from "./pages/ContactsPage";
import TopUpPage from "./pages/TopUpPage";
import PaymentLinksPage from "./pages/PaymentLinksPage";

// Layout shells (small, used by many routes — keep eager)
import KycAppLayout from "@/components/layout/KycAppLayout";
import ProtectedShell from "@/components/layout/ProtectedShell";
import ClientShell from "@/components/layout/ClientShell";
import KybGuard from "@/components/kyb/KybGuard";
import {
  AdminGuardShell,
  AdminSidebarShell,
} from "@/components/admin-portal/AdminRouteGuard";

// Lazy-loaded pages (admin, onboarding, legal, rarely-used)
const PrivacyPolicyPage = lazyImport(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazyImport(() => import("./pages/TermsPage"));
const RefundPolicyPage = lazyImport(() => import("./pages/RefundPolicyPage"));
const CompliancePage = lazyImport(() => import("./pages/CompliancePage"));
const Features = lazyImport(() => import("./pages/Features"));
const HowItWorks = lazyImport(() => import("./pages/HowItWorks"));
const About = lazyImport(() => import("./pages/About"));
const Contact = lazyImport(() => import("./pages/Contact"));
const BookPage = lazyImport(() => import("./pages/BookPage"));
const AuthConfirm = lazyImport(() => import("./pages/AuthConfirm"));
const ResetPasswordPage = lazyImport(() => import("./pages/ResetPasswordPage"));
const FinanceDashboard = lazyImport(() => import("./pages/FinanceDashboard"));
const AdminDashboard = lazyImport(() => import("./pages/AdminDashboard"));
const OperationsDashboard = lazyImport(() => import("./pages/OperationsDashboard"));
const SettingsDashboard = lazyImport(() => import("./pages/SettingsDashboard"));
const SendCpnPage = lazyImport(() => import("./pages/SendCpnPage"));
const EfinCardDetailPage = lazyImport(() => import("./pages/EfinCardDetailPage"));
const CustomerPortalPage = lazyImport(() => import("./pages/CustomerPortalPage"));
const ProfileSettingsPage = lazyImport(() => import("./pages/ProfileSettingsPage"));
const KYCPage = lazyImport(() => import("./pages/KYCPage"));
const SecurityPage = lazyImport(() => import("./pages/SecurityPage"));
const DepositComplete = lazyImport(() => import("./pages/DepositComplete"));
const PaymentCallback = lazyImport(() => import("./pages/PaymentCallback"));
const TransferTrackingPage = lazyImport(() => import("./pages/TransferTrackingPage"));
const TransfersListPage = lazyImport(() => import("./pages/TransfersListPage"));
const WalletStatementPage = lazyImport(() => import("./pages/WalletStatementPage"));
const TransactionDetailPage = lazyImport(() => import("./pages/TransactionDetailPage"));
const CanadaTransferPage = lazyImport(() => import("./pages/CanadaTransferPage"));
const ReceivePage = lazyImport(() => import("./pages/ReceivePage"));
const PayBillsPage = lazyImport(() => import("./pages/PayBillsPage"));
const CanadaBillPayPage = lazyImport(() => import("./pages/CanadaBillPayPage"));
const Welcome = lazyImport(() => import("./pages/onboarding/Welcome"));
const AccountType = lazyImport(() => import("./pages/onboarding/AccountType"));
const OnboardingIdentity = lazyImport(() => import("./pages/onboarding/Identity"));
const OnboardingEnhanced = lazyImport(() => import("./pages/onboarding/Enhanced"));
const OnboardingRejected = lazyImport(() => import("./pages/onboarding/Rejected"));
const KybDetails = lazyImport(() => import("./pages/onboarding/business/Details"));
const KybOwnership = lazyImport(() => import("./pages/onboarding/business/Ownership"));
const KybDocuments = lazyImport(() => import("./pages/onboarding/business/Documents"));
const KybReview = lazyImport(() => import("./pages/onboarding/business/Review"));
const KybSubmitted = lazyImport(() => import("./pages/onboarding/business/Submitted"));
const KybRejected = lazyImport(() => import("./pages/onboarding/business/Rejected"));
const BusinessOverview = lazyImport(() => import("./pages/business/BusinessOverview"));
const ShortLinkResolver = lazyImport(() => import("./pages/ShortLinkResolver"));
const ClaimPaymentLinkPage = lazyImport(() => import("./pages/ClaimPaymentLinkPage"));
const AdminDashboardPage = lazyImport(() => import("./pages/admin/AdminDashboardPage"));
const KycQueuePage = lazyImport(() => import("./pages/admin/KycQueuePage"));
const KycReviewPage = lazyImport(() => import("./pages/admin/KycReviewPage"));
const KybQueuePage = lazyImport(() => import("./pages/admin/KybQueuePage"));
const KybReviewPage = lazyImport(() => import("./pages/admin/KybReviewPage"));
const AdminAdyenLinksPage = lazyImport(() => import("./pages/admin/AdminAdyenLinksPage"));
const AdminAdyenTransactionsPage = lazyImport(() => import("./pages/admin/AdminAdyenTransactionsPage"));
const RiskTiersPage = lazyImport(() => import("./pages/admin/RiskTiersPage"));
const AuditLogPage = lazyImport(() => import("./pages/admin/AuditLogPage"));
const ApiManagementPage = lazyImport(() => import("./pages/admin/ApiManagementPage"));
const KycConfigPage = lazyImport(() => import("./pages/admin/KycConfigPage"));
const UsersPage = lazyImport(() => import("./pages/admin/UsersPage"));
const UserDetailPage = lazyImport(() => import("./pages/admin/UserDetailPage"));
const BusinessesPage = lazyImport(() => import("./pages/admin/BusinessesPage"));
const SystemDiagnosticsPage = lazyImport(() => import("./pages/admin/SystemDiagnosticsPage"));
const DataExportPage = lazyImport(() => import("./pages/admin/DataExportPage"));
const StaffPage = lazyImport(() => import("./pages/admin/StaffPage"));
const StaffDetailPage = lazyImport(() => import("./pages/admin/StaffDetailPage"));
const StaffOnboardingPage = lazyImport(() => import("./pages/admin/StaffOnboardingPage"));
const BoardDashboardPage = lazyImport(() => import("./pages/admin/BoardDashboardPage"));
const SecurityMonitoringPage = lazyImport(() => import("./pages/admin/SecurityMonitoringPage"));
const OperationalRiskPage = lazyImport(() => import("./pages/admin/OperationalRiskPage"));
const ComplianceRegisterPage = lazyImport(() => import("./pages/admin/ComplianceRegisterPage"));
const EddWorkflowPage = lazyImport(() => import("./pages/admin/EddWorkflowPage"));
const AuditorPortalPage = lazyImport(() => import("./pages/admin/AuditorPortalPage"));
const AmlPolicyPage = lazyImport(() => import("./pages/admin/AmlPolicyPage"));
const CddWorkflowPage = lazyImport(() => import("./pages/admin/CddWorkflowPage"));
const TransactionMonitoringPage = lazyImport(() => import("./pages/admin/TransactionMonitoringPage"));
const SanctionsScreeningPage = lazyImport(() => import("./pages/admin/SanctionsScreeningPage"));
const BeneficialOwnershipPage = lazyImport(() => import("./pages/admin/BeneficialOwnershipPage"));
const PepScreeningPage = lazyImport(() => import("./pages/admin/PepScreeningPage"));
const StrFilingPage = lazyImport(() => import("./pages/admin/StrFilingPage"));
const IncidentManagementPage = lazyImport(() => import("./pages/admin/IncidentManagementPage"));
const StaffTrainingPage = lazyImport(() => import("./pages/admin/StaffTrainingPage"));
const CorrespondentBankingPage = lazyImport(() => import("./pages/admin/CorrespondentBankingPage"));
const GeographicRiskPage = lazyImport(() => import("./pages/admin/GeographicRiskPage"));
const TravelRulePage = lazyImport(() => import("./pages/admin/TravelRulePage"));
const LctrPage = lazyImport(() => import("./pages/admin/LctrPage"));
const EftrPage = lazyImport(() => import("./pages/admin/EftrPage"));
const TradeAmlPage = lazyImport(() => import("./pages/admin/TradeAmlPage"));
const WireTransfersPage = lazyImport(() => import("./pages/admin/WireTransfersPage"));
const RegulatoryChangesPage = lazyImport(() => import("./pages/admin/RegulatoryChangesPage"));
const SettlementReconciliationPage = lazyImport(() => import("./pages/admin/SettlementReconciliationPage"));
const PeriodEndControlsPage = lazyImport(() => import("./pages/admin/PeriodEndControlsPage"));
const EvidenceRepositoryPage = lazyImport(() => import("./pages/admin/EvidenceRepositoryPage"));
const InteracCallback = lazyImport(() => import("./pages/InteracCallback"));
const InteracHubCallback = lazyImport(() => import("./pages/InteracHubCallback"));
const MorePage = lazyImport(() => import("./pages/MorePage"));
const StripeConnectInstantPage = lazyImport(() => import("./pages/StripeConnectInstantPage"));
const AfricanCardSendPage = lazyImport(() => import("./pages/AfricanCardSendPage"));
const CommunicationHubPage = lazyImport(() => import("./pages/admin/CommunicationHubPage"));
const SupportInboxPage = lazyImport(() => import("./pages/admin/SupportInboxPage"));
const PricingPage = lazyImport(() => import("./pages/admin/PricingPage"));
const RevenuePage = lazyImport(() => import("./pages/admin/RevenuePage"));
const SupportPage = lazyImport(() => import("./pages/SupportPage"));
const ResetPinPage = lazyImport(() => import("./pages/ResetPinPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

const FullPageSpinner = () => {
  const { timedOut, retry } = useAuth();
  if (timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "#07122e" }}>
        <p className="text-white text-base">Still loading. Please check your connection and try again.</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#07122e" }}>
      <LoadingSpinner size={140} />
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading && !user) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const RoleProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: ("admin" | "finance" | "compliance")[];
}) => {
  const { user, loading } = useAuth();
  const { isBootstrapped } = useAppSession();
  const { isAdmin, isFinance, isCompliance, isLoading: rolesLoading, isError, refetch } = useUserRoles();
  useEffect(() => {
    if (isError) toast.error("Could not verify your access. Please try again.", { id: "role-fetch-error" });
  }, [isError]);
  if (loading && !user) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (rolesLoading && !isBootstrapped) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Could not verify your account permissions. This may be a temporary network issue.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const roleMap = { admin: isAdmin, finance: isFinance, compliance: isCompliance };
  const hasAccess = allowedRoles.some((role) => roleMap[role]);
  if (!hasAccess) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const KycShellRoute = () => (
  <ProtectedRoute>
    <KycAppLayout />
  </ProtectedRoute>
);

const ProtectedShellRoute = () => (
  <ProtectedRoute>
    <ProtectedShell />
  </ProtectedRoute>
);

const RoleShellRoute = ({
  allowedRoles,
}: {
  allowedRoles: ("admin" | "finance" | "compliance")[];
}) => (
  <RoleProtectedRoute allowedRoles={allowedRoles}>
    <ClientShell />
  </RoleProtectedRoute>
);

const RootRoute = () => {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner size={120} />
      </div>
    );
  }
  return <Landing />;
};

const AppRoutes = () => {
  const location = useLocation();

  // Workaround for a known Radix UI bug where Dialog/DropdownMenu
  // sometimes leaves `pointer-events: none` stuck on <body> after closing.
  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, [location.pathname]);

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes location={location}>
        <Route path="/" element={<RootRoute />} />
        <Route path="/s/:code" element={<ShortLinkResolver />} />
        <Route path="/claim/:code" element={<GatedPage feature="paymentLinks"><ClaimPaymentLinkPage /></GatedPage>} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund" element={<RefundPolicyPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/features" element={<Features />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />

        <Route element={<KycShellRoute />}>
          <Route path="/dashboard" element={<Index />} />
          <Route path="/business" element={<KybGuard><BusinessOverview /></KybGuard>} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/wallets/:walletId/statement" element={<WalletStatementPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/send/cpn" element={<GatedPage feature="crypto"><SendCpnPage /></GatedPage>} />
          <Route path="/send/african-card" element={<GatedPage feature="stripe"><AfricanCardSendPage /></GatedPage>} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/cards" element={<GatedPage feature="cards"><CardsPage /></GatedPage>} />
          <Route path="/cards/efin/:id" element={<GatedPage feature="cards"><EfinCardDetailPage /></GatedPage>} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/transfers" element={<TransfersListPage />} />
          <Route path="/transfers/:id" element={<TransferTrackingPage />} />
          <Route path="/transactions/:journalId" element={<TransactionDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/payees" element={<ContactsPage />} />
          <Route path="/payment-links" element={<GatedPage feature="paymentLinks"><PaymentLinksPage /></GatedPage>} />
          <Route path="/transfers/canada" element={<GatedPage feature="canadaDomestic"><CanadaTransferPage /></GatedPage>} />
          <Route path="/wallet/receive" element={<ReceivePage />} />
          <Route path="/wallet/topup" element={<TopUpPage />} />
          <Route path="/pay-bills" element={<GatedPage feature="billPay"><PayBillsPage /></GatedPage>} />
          <Route path="/pay-bills/canada" element={<GatedPage feature="billPay"><CanadaBillPayPage /></GatedPage>} />
          <Route path="/stripe-connect" element={<GatedPage feature="stripe"><StripeConnectInstantPage /></GatedPage>} />
        </Route>

        <Route element={<RoleShellRoute allowedRoles={["admin", "finance"]} />}>
          <Route path="/finance" element={<FinanceDashboard />} />
        </Route>
        <Route element={<RoleShellRoute allowedRoles={["admin"]} />}>
          <Route path="/admin/legacy" element={<AdminDashboard />} />
          <Route path="/settings" element={<SettingsDashboard />} />
        </Route>
        <Route element={<RoleShellRoute allowedRoles={["admin", "compliance", "finance"]} />}>
          <Route path="/operations" element={<OperationsDashboard />} />
        </Route>

        {/* Admin-sidebar versions of Finance / Operations / Settings */}
        <Route element={<AdminSidebarShell />}>
          <Route path="/admin/finance" element={<FinanceDashboard />} />
          <Route path="/admin/operations" element={<OperationsDashboard />} />
          <Route path="/admin/communication" element={<CommunicationHubPage />} />
          <Route path="/admin/support" element={<SupportInboxPage />} />
          <Route path="/admin/settings" element={<SettingsDashboard />} />
          <Route path="/admin/pricing" element={<PricingPage />} />
          <Route path="/admin/revenue" element={<RevenuePage />} />
        </Route>

        <Route element={<ProtectedShellRoute />}>
          <Route path="/profile" element={<ProfileSettingsPage />} />
          <Route path="/kyc" element={<KYCPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Route>

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route element={<AdminGuardShell />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/kyc" element={<KycQueuePage />} />
          <Route path="/admin/kyc/:id" element={<KycReviewPage />} />
          <Route path="/admin/kyb" element={<KybQueuePage />} />
          <Route path="/admin/kyb/:id" element={<KybReviewPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/businesses" element={<BusinessesPage />} />
          <Route path="/admin/businesses/:id" element={<KybReviewPage />} />
          <Route path="/admin/risk-tiers" element={<RiskTiersPage />} />
          <Route path="/admin/audit-log" element={<AuditLogPage />} />
          <Route path="/admin/api" element={<ApiManagementPage />} />
          <Route path="/admin/kyc-config" element={<KycConfigPage />} />
          <Route path="/admin/diagnostics" element={<SystemDiagnosticsPage />} />
          <Route path="/admin/data-export" element={<DataExportPage />} />
          <Route path="/admin/staff" element={<StaffPage />} />
          <Route path="/admin/staff/:id" element={<StaffDetailPage />} />
          <Route path="/admin/onboarding" element={<StaffOnboardingPage />} />
          <Route path="/admin/board-dashboard" element={<BoardDashboardPage />} />
          <Route path="/admin/security" element={<SecurityMonitoringPage />} />
          <Route path="/admin/operational-risks" element={<OperationalRiskPage />} />
          <Route path="/admin/compliance-register" element={<ComplianceRegisterPage />} />
          <Route path="/admin/edd" element={<EddWorkflowPage />} />
          <Route path="/admin/auditor-portal" element={<AuditorPortalPage />} />
          <Route path="/admin/aml-policy" element={<AmlPolicyPage />} />
          <Route path="/admin/cdd" element={<CddWorkflowPage />} />
          <Route path="/admin/transaction-monitoring" element={<TransactionMonitoringPage />} />
          <Route path="/admin/sanctions" element={<SanctionsScreeningPage />} />
          <Route path="/admin/beneficial-ownership" element={<BeneficialOwnershipPage />} />
          <Route path="/admin/pep-screening" element={<PepScreeningPage />} />
          <Route path="/admin/str-filing" element={<StrFilingPage />} />
          <Route path="/admin/incidents" element={<IncidentManagementPage />} />
          <Route path="/admin/training" element={<StaffTrainingPage />} />
          <Route path="/admin/correspondent-banking" element={<CorrespondentBankingPage />} />
          <Route path="/admin/geographic-risk" element={<GeographicRiskPage />} />
          <Route path="/admin/travel-rule" element={<TravelRulePage />} />
          <Route path="/admin/lctr" element={<LctrPage />} />
          <Route path="/admin/eftr" element={<EftrPage />} />
          <Route path="/admin/trade-aml" element={<TradeAmlPage />} />
          <Route path="/admin/wire-transfers" element={<WireTransfersPage />} />
          <Route path="/admin/regulatory-changes" element={<RegulatoryChangesPage />} />
          <Route path="/admin/settlement-reconciliation" element={<SettlementReconciliationPage />} />
          <Route path="/admin/period-end-controls" element={<PeriodEndControlsPage />} />
          <Route path="/admin/evidence-repository" element={<EvidenceRepositoryPage />} />
          <Route path="/admin/payments/adyen" element={<AdminAdyenLinksPage />} />
          <Route path="/admin/payments/adyen/transactions" element={<AdminAdyenTransactionsPage />} />
        </Route>

        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-pin" element={<ResetPinPage />} />
        <Route path="/portal" element={<CustomerPortalPage />} />
        <Route path="/deposit/complete" element={<DepositComplete />} />
        <Route path="/payment-callback" element={<PaymentCallback />} />
        <Route path="/callback" element={<InteracCallback />} />
        <Route path="/interac/callback" element={<InteracHubCallback />} />
        <Route path="/onboarding/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
        <Route path="/onboarding/account-type" element={<ProtectedRoute><AccountType /></ProtectedRoute>} />
        <Route path="/onboarding/identity" element={<ProtectedRoute><OnboardingIdentity /></ProtectedRoute>} />
        <Route path="/onboarding/enhanced" element={<ProtectedRoute><OnboardingEnhanced /></ProtectedRoute>} />
        <Route path="/onboarding/pending" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding/approved" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding/rejected" element={<ProtectedRoute><OnboardingRejected /></ProtectedRoute>} />
        <Route path="/onboarding/business" element={<Navigate to="/onboarding/business/details" replace />} />
        <Route path="/onboarding/business/details" element={<ProtectedRoute><KybDetails /></ProtectedRoute>} />
        <Route path="/onboarding/business/ownership" element={<ProtectedRoute><KybOwnership /></ProtectedRoute>} />
        <Route path="/onboarding/business/documents" element={<ProtectedRoute><KybDocuments /></ProtectedRoute>} />
        <Route path="/onboarding/business/review" element={<ProtectedRoute><KybReview /></ProtectedRoute>} />
        <Route path="/onboarding/business/submitted" element={<ProtectedRoute><KybSubmitted /></ProtectedRoute>} />
        <Route path="/onboarding/business/rejected" element={<ProtectedRoute><KybRejected /></ProtectedRoute>} />
        <Route path="/settings/profile" element={<Navigate to="/profile" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <AppBootstrap>
            <TooltipProvider>
              <SplashScreen />
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <AppRoutes />
              </BrowserRouter>
            </TooltipProvider>
          </AppBootstrap>
        </AdminAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
