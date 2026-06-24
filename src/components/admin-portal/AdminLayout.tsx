import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShieldCheck, Users, Layers, ScrollText, Settings, Bell, Search, LogOut, ChevronLeft, ChevronRight, Sun, Moon, Activity, ExternalLink, SlidersHorizontal, UserCog, Gauge, AlertCircle, FileText, Eye, ShieldAlert } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleBadge } from "./Badges";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/kyc", label: "KYC Queue", icon: ShieldCheck },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/staff", label: "Staff", icon: UserCog, requiresStaffMgmt: true },
  { to: "/admin/board-dashboard", label: "Board", icon: Gauge },
  { to: "/admin/security", label: "Security", icon: ShieldCheck },
  { to: "/admin/compliance-register", label: "Compliance", icon: FileText },
  { to: "/admin/edd", label: "EDD", icon: ShieldAlert },
  { to: "/admin/auditor-portal", label: "Auditor", icon: Eye },
  { to: "/admin/risk-tiers", label: "Risk Tiers", icon: Layers },
  { to: "/admin/kyc-config", label: "KYC Config", icon: SlidersHorizontal },
  { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
  { to: "/admin/diagnostics", label: "Diagnostics", icon: Activity },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { admin, signOut, hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

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
    refetchInterval: 30000,
  });

  // Realtime: KYC submissions
  useEffect(() => {
    if (!admin) return;
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [admin, queryClient, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/admin/users?q=${encodeURIComponent(search.trim())}`);
  };

  const markAllRead = async () => {
    if (!admin) return;
    await supabase.from("admin_notifications").update({ is_read: true }).eq("admin_id", admin.id).eq("is_read", false);
    queryClient.invalidateQueries({ queryKey: ["admin-notifications", admin.id] });
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
        {NAV.filter((item) => !item.requiresStaffMgmt || hasPermission("manage_staff")).map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          const badge = item.to === "/admin/kyc" && pendingKycCount > 0 ? pendingKycCount : null;
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
        })}
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

          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name, email, account #"
                className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background"
              />
            </div>
          </form>

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

        <main className="flex-1 p-4 lg:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
