import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  FileText,
  Home,
  Landmark,
  LogOut,
  PlusCircle,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationsPanel from "@/components/header/NotificationsPanel";
import PendingTransfersButton from "@/components/header/PendingTransfersButton";
import SupportLink from "@/components/header/SupportLink";
import SearchModal from "@/components/header/SearchModal";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useKyb } from "@/hooks/useKyb";
import { useProfile } from "@/hooks/useProfile";
import { useUserRoles } from "@/hooks/useUserRoles";
import { prefetchRoute } from "@/lib/prefetchRoute";
import { businessAccountLabel, isBusinessPrimaryAccount, kybResumePath } from "@/lib/kybOnboarding";
import { Logo } from "@/components/Logo";
import { resolveAvatarUrl } from "@/lib/avatar";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
};

type NavGroup = {
  id: string;
  label: string;
  color: string;
  items: NavItem[];
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function isItemActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  if (href === "/profile") return ["/profile", "/settings", "/security"].some((path) => pathname.startsWith(path));
  return pathname === href || pathname.startsWith(`${href}/`);
}

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { business } = useKyb();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const tablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
    "Account";
  const firstName = displayName.split(" ")[0] || "Account";
  const initial = firstName.charAt(0).toUpperCase() || "E";
  const avatarUrl = resolveAvatarUrl(profile, user);

  const warmRoute = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  const management: NavItem[] = [
    { label: "Contacts", href: "/contacts", icon: Users, color: "var(--color-accent-lightblue)" },
    { label: "Business", href: kybResumePath(business), icon: Briefcase, color: "var(--color-accent-violet)" },
  ];
  if (isAdmin) management.push({ label: "Admin", href: "/admin", icon: Shield, color: "var(--color-accent-slate)" });
  else {
    if (isFinance) management.push({ label: "Finance", href: "/finance", icon: Landmark, color: "var(--color-accent-slate)" });
    if (isFinance || isCompliance) {
      management.push({ label: "Operations", href: "/operations", icon: Briefcase, color: "var(--color-accent-slate)" });
    }
  }

  const groups: NavGroup[] = [
    {
      id: "overview",
      label: "Overview",
      color: "var(--color-accent-gold)",
      items: [{ label: "Dashboard", href: "/dashboard", icon: Home, color: "var(--color-accent-gold)" }],
    },
    {
      id: "movement",
      label: "Money Movement",
      color: "var(--color-accent-blue)",
      items: [
        { label: "Send", href: "/send", icon: ArrowUpRight, color: "var(--color-accent-blue)" },
        { label: "Top Up", href: "/wallet/topup", icon: PlusCircle, color: "var(--color-accent-emerald)" },
        { label: "Request", href: "/request-money", icon: ArrowDownLeft, color: "var(--color-accent-purple)" },
        { label: "Exchange", href: "/exchange", icon: RefreshCw, color: "var(--color-accent-orange)" },
      ],
    },
    {
      id: "accounts",
      label: "Accounts & Assets",
      color: "var(--color-accent-pink)",
      items: [
        { label: "Bank", href: "/wallet/receive", icon: Landmark, color: "var(--color-accent-pink)" },
        { label: "Wallets", href: "/wallets", icon: Wallet, color: "var(--color-accent-green)" },
        { label: "Bills", href: "/pay-bills", icon: FileText, color: "var(--color-accent-yellow)" },
      ],
    },
    {
      id: "management",
      label: "Management",
      color: "var(--color-accent-slate)",
      items: management,
    },
  ];

  const renderLink = (item: NavItem) => {
    const active = isItemActive(item.href, location.pathname);
    const link = (
      <Link
        to={item.href}
        className={active ? "nav-link is-active" : "nav-link"}
        style={{ "--item-accent": item.color } as CSSProperties}
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => warmRoute(item.href)}
        onFocus={() => warmRoute(item.href)}
      >
        <item.icon size={20} aria-hidden />
        <span className="nav-label">{item.label}</span>
      </Link>
    );

    if (!tablet) return <div key={item.label}>{link}</div>;

    return (
      <Tooltip key={item.label}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="sidebar" aria-label="Primary">
        <Link to="/dashboard" className="brand">
          <Logo static className="brand-logo" />
          <span className="brand-copy">
            <span className="brand-name">eFinMoney</span>
            <span className="brand-sub">Business Platform</span>
          </span>
        </Link>

        <div className="sidebar-scroll">
          {groups.map((group, index) => (
            <div key={group.id}>
              {index > 0 && <div className="nav-sep" />}
              <p className="group-label" style={{ "--group-color": group.color } as CSSProperties}>
                {group.label}
              </p>
              {group.items.map((item) => renderLink(item))}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="nav-sep" />
          <div className="sidebar-tools">
            <button type="button" className="sidebar-tool" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search size={20} />
            </button>
            <NotificationsPanel variant="dialog" />
            <PendingTransfersButton />
            <SupportLink />
            <ThemeToggle />
          </div>
          {renderLink({ label: "Settings", href: "/profile", icon: Settings, color: "var(--color-accent-slate)" })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="user-row" aria-label={`${firstName}, eFinMoney account`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="user-avatar-img" />
                ) : (
                  <span className="user-avatar" aria-hidden>{initial}</span>
                )}
                <span className="user-copy">
                  <span className="user-name">{firstName}</span>
                  <span className="user-sub">eFinMoney</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-64">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">Account</p>
                <p className="text-xs text-muted-foreground truncate">{firstName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/dashboard")}>Home</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/profile")}>Profile settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/kyc")}>
                {isBusinessPrimaryAccount(user, business) ? "Business verification" : "KYC verification"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/security")}>Security</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(kybResumePath(business))}>
                <Building2 className="w-4 h-4 mr-2" />
                {businessAccountLabel(business)}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <SearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
      />
    </TooltipProvider>
  );
};

export default AppSidebar;
