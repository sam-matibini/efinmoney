import { ReactNode, Suspense, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LayoutDashboard, ShieldCheck, Users, Layers, ScrollText, Settings, Bell, Search, LogOut, ChevronLeft, ChevronRight, Sun, Moon, Activity, ExternalLink, SlidersHorizontal, UserCog, Gauge, AlertCircle, FileText, Eye, ShieldAlert, Shield, ClipboardList, Ban, UserX, Building2, FileWarning, GraduationCap, Landmark, Globe, ArrowLeftRight, Banknote, RefreshCw, TrendingUp, Zap, BookOpen, BarChart2, Scale, CalendarCheck, Archive, PanelLeft, Wallet, Cog, Megaphone, Headphones, Tags, Code2, UserPlus, Briefcase, ListChecks, CircleUser, Route, CreditCard } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "./Badges";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { DeferredAliceWidget } from "@/components/layout/DeferredShellWidgets";
import AdminPageSkeleton from "@/components/admin-portal/AdminPageSkeleton";
import AdminGlobalSearch from "@/components/admin-portal/AdminGlobalSearch";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresStaffMgmt?: boolean;
  requiresDeveloperOnboarding?: boolean;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** Open by default so key ops stay visible without hunting */
  defaultOpen?: boolean;
  /** Slightly stronger header styling for high-traffic sections */
  emphasize?: boolean;
};

const TOP_NAV: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/simple", label: "Simple admin", icon: PanelLeft },
  { to: "/admin/board-dashboard", label: "Board", icon: Gauge },
  { to: "/admin/portal", label: "My portal", icon: CircleUser },
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Partners & Pricing",
    icon: CreditCard,
    defaultOpen: true,
    emphasize: true,
    items: [
      { to: "/admin/nomba-fincra", label: "Nomba & Fincra", icon: CreditCard },
      { to: "/admin/pricing?tab=partners", label: "Corridor rails", icon: Route },
      { to: "/admin/ops-queue", label: "Ops queue", icon: Scale },
      { to: "/admin/pricing?tab=pricing-rates", label: "Pricing & Rates", icon: Tags },
      { to: "/admin/pricing?tab=rate-card", label: "Rate card", icon: Tags },
      { to: "/admin/api", label: "Payment APIs", icon: Settings },
    ],
  },
  {
    label: "Queue", icon: Layers, items: [
      { to: "/admin/kyc", label: "KYC Queue", icon: ShieldCheck },
      { to: "/admin/kyb", label: "KYB Queue", icon: Building2 },
    ],
  },
  {
    label: "Users", icon: Users, items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/businesses", label: "Businesses", icon: Building2 },
      { to: "/admin/staff", label: "Staff", icon: UserCog, requiresStaffMgmt: true },
    ],
  },
  {
    label: "Finance", icon: Wallet, items: [
      { to: "/admin/finance", label: "Finance", icon: Wallet },
      { to: "/admin/verto", label: "Verto clearing", icon: ArrowLeftRight },
      { to: "/admin/revenue", label: "Revenue", icon: TrendingUp },
      { to: "/admin/payroll", label: "Payroll", icon: Banknote },
      { to: "/admin/settlement-reconciliation", label: "Settlement Rec.", icon: Scale },
      { to: "/admin/period-end-controls", label: "Period-End", icon: CalendarCheck },
      { to: "/admin/evidence-repository", label: "Evidence Repo", icon: Archive },
    ],
  },
  {
    label: "Operations", icon: PanelLeft, items: [
      { to: "/admin/operations", label: "Operations", icon: PanelLeft },
      { to: "/admin/communication", label: "Communication", icon: Megaphone },
      { to: "/admin/support", label: "Support", icon: Headphones },
      { to: "/admin/training", label: "Training", icon: GraduationCap },
    ],
  },
  {
    label: "Compliance", icon: Shield, items: [
      { to: "/admin/cdd", label: "CDD", icon: ClipboardList },
      { to: "/admin/edd", label: "EDD", icon: ShieldCheck },
      { to: "/admin/beneficial-ownership", label: "Ownership", icon: Building2 },
      { to: "/admin/compliance-register", label: "Compliance Reg.", icon: FileText },
      { to: "/admin/aml-policy", label: "AML Policy", icon: Shield },
      { to: "/admin/kyc-config", label: "KYC Config", icon: SlidersHorizontal },
      { to: "/admin/risk-tiers", label: "Risk Tiers", icon: Layers },
    ],
  },
  {
    label: "Screening", icon: Search, items: [
      { to: "/admin/sanctions", label: "Sanctions", icon: Ban },
      { to: "/admin/pep-screening", label: "PEP Screening", icon: UserX },
      { to: "/admin/geographic-risk", label: "Geo Risk", icon: Globe },
    ],
  },
  {
    label: "Monitoring", icon: Activity, items: [
      { to: "/admin/transaction-monitoring", label: "TX Monitor", icon: BarChart2 },
      { to: "/admin/trade-aml", label: "Trade AML", icon: TrendingUp },
      { to: "/admin/correspondent-banking", label: "Correspond. Banks", icon: Landmark },
      { to: "/admin/travel-rule", label: "Travel Rule", icon: ArrowLeftRight },
      { to: "/admin/lctr", label: "LCTR", icon: Banknote },
      { to: "/admin/eftr", label: "EFTR", icon: RefreshCw },
      { to: "/admin/wire-transfers", label: "Wire Act", icon: Zap },
      { to: "/admin/regulatory-changes", label: "Reg. Changes", icon: BookOpen },
    ],
  },
  {
    label: "Audit & Reporting", icon: ScrollText, items: [
      { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
      { to: "/admin/str-filing", label: "STR / SAR", icon: FileWarning },
      { to: "/admin/auditor-portal", label: "Auditor Portal", icon: Eye },
    ],
  },
  {
    label: "Security", icon: ShieldAlert, items: [
      { to: "/admin/security", label: "Security", icon: ShieldAlert },
      { to: "/admin/incidents", label: "Incidents", icon: AlertCircle },
    ],
  },
  {
    label: "System", icon: Cog, items: [
      { to: "/admin/settings", label: "Settings", icon: Cog },
      { to: "/admin/diagnostics", label: "Diagnostics", icon: Activity },
      { to: "/admin/api", label: "API Management", icon: Settings },
    ],
  },
  {
    label: "Developer", icon: Code2, items: [
      { to: "/admin/developer", label: "Dashboard", icon: Code2, requiresDeveloperOnboarding: true },
      { to: "/admin/developer/onboard-user", label: "Onboard User", icon: UserPlus, requiresDeveloperOnboarding: true },
      { to: "/admin/developer/onboard-business", label: "Onboard Business", icon: Briefcase, requiresDeveloperOnboarding: true },
      { to: "/admin/developer/onboarded", label: "Onboarded by Me", icon: ListChecks, requiresDeveloperOnboarding: true },
    ],
  },
];

const ALL_GROUP_LABELS = NAV_GROUPS.map((g) => g.label);

// Each role gets the sidebar groups that match their job. Super admin
// sees everything; the rest are scoped to the modules they need to do
// their work and nothing more.
const ROLE_NAV_GROUPS: Record<string, ReadonlySet<string>> = {
  super_admin: new Set(ALL_GROUP_LABELS),
  compliance_officer: new Set([
    "Users", "Queue", "Compliance", "Screening", "Monitoring", "Audit & Reporting",
  ]),
  finance_officer: new Set([
    "Payments", "Users", "Finance", "Audit & Reporting",
  ]),
  support_agent: new Set([
    "Users", "Operations",
  ]),
  viewer: new Set([
    "Users", "Audit & Reporting",
  ]),
};

function navPath(to: string) {
  const q = to.indexOf("?");
  return q === -1 ? to : to.slice(0, q);
}

function navSearchParams(to: string) {
  const q = to.indexOf("?");
  return q === -1 ? null : new URLSearchParams(to.slice(q + 1));
}

function isNavItemActive(pathname: string, search: string, to: string) {
  const path = navPath(to);
  if (pathname !== path && !pathname.startsWith(path + "/")) return false;
  const want = navSearchParams(to);
  if (!want) return true;
  const have = new URLSearchParams(search);
  for (const [key, value] of want.entries()) {
    const current = have.get(key);
    // Pricing defaults to Partners & Routing (Corridor rails) when ?tab is omitted
    if (path === "/admin/pricing" && key === "tab" && value === "partners" && !current) {
      continue;
    }
    if (current !== value) return false;
  }
  return true;
}

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { admin, signOut, hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const group of NAV_GROUPS) {
      if (group.defaultOpen) defaults[group.label] = true;
    }
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("admin-nav-sections") || "{}") };
    } catch {
      return defaults;
    }
  });

  // Persist section expand/collapse state
  useEffect(() => {
    localStorage.setItem("admin-nav-sections", JSON.stringify(expandedSections));
  }, [expandedSections]);

  // Auto-expand active section on navigation
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      const isActive = group.items.some((item) =>
        isNavItemActive(location.pathname, location.search, item.to)
        || location.pathname === navPath(item.to)
        || location.pathname.startsWith(navPath(item.to) + "/")
      );
      if (isActive && !expandedSections[group.label]) {
        setExpandedSections((prev) => ({ ...prev, [group.label]: true }));
        break;
      }
    }
  }, [location.pathname, location.search]);

  // Notifications query
  const { data: notifications = [] } = useQuery({
    queryKey: ["admin-notifications", admin?.id],
    queryFn: async () => {
      if (!admin) return [];
      const { data } = await supabase
        .from("admin_notifications")
        .select("*")
        .eq("admin_id", admin.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!admin,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Pending KYC count for the sidebar badge
  const { data: pendingKycCount = 0 } = useQuery({
    queryKey: ["admin-pending-kyc-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("kyc_verifications")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending_review");
      return count || 0;
    },
    enabled: !!admin,
  });

  // Realtime: KYC submissions
  useEffect(() => {
    if (!admin?.id) return;
    const ch = supabase
      .channel("admin-kyc-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kyc_verifications" },
        (payload: { new?: Record<string, unknown> }) => {
          const newRow = payload.new;
          if (newRow && newRow.verification_status === "pending_review") {
            toast.info("New KYC submission received", {
              action: { label: "Review", onClick: () => navigate("/admin/kyc") },
            });
          }
          queryClient.invalidateQueries({ queryKey: ["admin-kyc-queue"] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["admin-pending-kyc-count"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications", filter: `admin_id=eq.${admin.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-notifications", admin.id] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kyc_audit_log" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_risk_tiers" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [admin?.id, queryClient, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth?next=/admin/dashboard");
  };

  const markAllRead = async () => {
    if (!admin) return;
    await supabase.from("admin_notifications").update({ is_read: true }).eq("admin_id", admin.id).eq("is_read", false);
    queryClient.invalidateQueries({ queryKey: ["admin-notifications", admin.id] });
  };

  const allowedForRole = admin ? ROLE_NAV_GROUPS[admin.role] : undefined;
  const isGroupAllowed = (label: string) => !allowedForRole || allowedForRole.has(label);

  const allNavItems = [
    ...TOP_NAV,
    ...NAV_GROUPS.filter((g) => isGroupAllowed(g.label)).flatMap((g) => g.items),
  ];

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isNavItemActive(location.pathname, location.search, item.to);
    const badge = navPath(item.to) === "/admin/kyc" && pendingKycCount > 0 ? pendingKycCount : null;
    const visible =
      (!item.requiresStaffMgmt || hasPermission("manage_staff")) &&
      (!item.requiresDeveloperOnboarding || hasPermission("developer_onboarding"));
    if (!visible) return null;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {badge !== null && (
          <span
            className={cn(
              "rounded-full text-[10px] font-bold min-w-[20px] px-1.5 py-0.5 text-center",
              active ? "bg-sidebar-primary-foreground text-sidebar-primary" : "bg-destructive text-destructive-foreground",
              collapsed && "absolute top-1 right-1"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </NavLink>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    // Hide groups the current role isn't allowed to see.
    const allowedForRole = admin ? ROLE_NAV_GROUPS[admin.role] : undefined;
    if (allowedForRole && !allowedForRole.has(group.label)) return null;

    const visibleItems = group.items.filter(
      (item) =>
        (!item.requiresStaffMgmt || hasPermission("manage_staff")) &&
        (!item.requiresDeveloperOnboarding || hasPermission("developer_onboarding"))
    );
    if (visibleItems.length === 0) return null;

    const isExpanded = expandedSections[group.label] ?? group.defaultOpen ?? false;
    const GroupIcon = group.icon;
    const kycBadge = group.label === "Queue" && pendingKycCount > 0 ? pendingKycCount : null;

    return (
      <div key={group.label} className={cn(group.emphasize && !collapsed && "rounded-xl bg-sidebar-accent/40 p-1.5 mb-1")}>
        <button
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, [group.label]: !prev[group.label] }));
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors",
            collapsed
              ? "justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent relative"
              : group.emphasize
                ? "text-sidebar-foreground hover:bg-sidebar-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          )}
        >
          <GroupIcon className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{group.label}</span>
              {kycBadge !== null && (
                <span
                  className={cn(
                    "rounded-full text-[10px] font-bold min-w-[20px] px-1.5 py-0.5 text-center bg-destructive text-destructive-foreground",
                    collapsed && "absolute top-1 right-1"
                  )}
                >
                  {kycBadge > 99 ? "99+" : kycBadge}
                </span>
              )}
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0", isExpanded && "rotate-180")} />
            </>
          )}
          {collapsed && kycBadge !== null && (
            <span className="absolute top-1 right-1 rounded-full text-[10px] font-bold min-w-[20px] px-1.5 py-0.5 text-center bg-destructive text-destructive-foreground">
              {kycBadge > 99 ? "99+" : kycBadge}
            </span>
          )}
        </button>
        {!collapsed && isExpanded && (
          <div className="ml-2 space-y-0.5 border-l border-sidebar-border pl-2">
            {visibleItems.map(renderNavItem)}
          </div>
        )}
      </div>
    );
  };

  const SidebarContent = (
    <div className={cn("h-full flex flex-col bg-sidebar border-r border-sidebar-border transition-all", collapsed ? "w-16" : "w-64")}>
      {/* Logo */}
      <div className="h-16 px-4 flex items-center gap-2 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">e</div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm text-sidebar-foreground">eFin Money</div>
            <div className="text-xs text-muted-foreground">Admin</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {collapsed
          ? allNavItems
              .filter(
                (item) =>
                  (!item.requiresStaffMgmt || hasPermission("manage_staff")) &&
                  (!item.requiresDeveloperOnboarding || hasPermission("developer_onboarding"))
              )
              .map(renderNavItem)
          : (
            <>
              <AdminGlobalSearch
                compact
                placeholder="Search nav..."
                className="mb-2"
                onNavigate={() => setMobileOpen(false)}
              />
              {TOP_NAV.filter(
                (item) =>
                  (!item.requiresStaffMgmt || hasPermission("manage_staff")) &&
                  (!item.requiresDeveloperOnboarding || hasPermission("developer_onboarding"))
              ).map(renderNavItem)}
              <div className="my-2 border-t border-sidebar-border" />
              {NAV_GROUPS.map(renderNavGroup)}
            </>
          )}
      </nav>

      {/* Profile */}
      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && admin && (
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium truncate text-sidebar-foreground">{admin.full_name || "Administrator"}</div>
            <div className="mt-1"><RoleBadge role={admin.role} /></div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start gap-2">
          <LogOut className="w-4 h-4" /> {!collapsed && "Sign out"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full justify-start gap-2 mt-1 hidden lg:flex"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={cn(
        "fixed lg:sticky inset-y-0 left-0 z-50 lg:z-10 transition-transform lg:translate-x-0 lg:top-0 lg:h-screen",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {SidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border flex items-center gap-3 px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Layers className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={() => setCollapsed((c) => !c)}>
            <PanelLeft className="w-5 h-5" />
          </Button>

          <AdminGlobalSearch className="flex-1 max-w-md" />

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="hidden sm:inline-flex gap-2"
            >
              <ExternalLink className="w-4 h-4" /> User portal
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between p-3 border-b">
                  <span className="font-medium text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">Mark all read</Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
                  ) : notifications.map((n) => (
                    <div key={n.id} className={cn("p-3 border-b text-sm", !n.is_read && "bg-accent/30")}>
                      <div className="font-medium capitalize">{n.type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                    {(admin?.full_name || "A")[0]}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{admin?.full_name || "Administrator"}</div>
                  {admin && <div className="mt-1"><RoleBadge role={admin.role} /></div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/")}>
                  <ExternalLink className="w-4 h-4 mr-2" /> Open user portal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/settings")}>
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 min-w-0">
          <Suspense fallback={<AdminPageSkeleton />}>{children}</Suspense>
        </main>
      </div>
      <DeferredAliceWidget context="admin" />
    </div>
  );
};

export default AdminLayout;
