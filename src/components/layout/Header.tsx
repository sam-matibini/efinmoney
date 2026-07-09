import { useState } from "react";
import {
  Search,
  LogOut,
  Shield,
  Wallet,
  Settings,
  Cog,
  Menu,
  LayoutDashboard,
  Send,
  Link2,
  ArrowDownToLine,
  Users,
  RefreshCw,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationsPanel from "@/components/header/NotificationsPanel";
import QuickActionsPopover from "@/components/layout/QuickActionsPopover";
import SearchModal from "@/components/header/SearchModal";
import HeaderNavItem from "@/components/layout/HeaderNavItem";
import { Logo, Wordmark } from "@/components/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { prefetchRoute } from "@/lib/prefetchRoute";
import { avatarInitials, resolveAvatarUrl } from "@/lib/avatar";
import {
  headerIconBase,
  headerIconInteractive,
  headerIconVariants,
  headerNavTrack,
  headerSearchClass,
  navIconTint,
  navMobileClass,
  profileBadgeClass,
  profileTriggerClass,
} from "@/components/layout/headerStyles";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navIcons: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Send: Send,
  "Payment links": Link2,
  "Top up": ArrowDownToLine,
  Contacts: Users,
  Exchange: RefreshCw,
  Wallets: Wallet,
  Cards: CreditCard,
  Finance: Wallet,
  Operations: Settings,
  Admin: Shield,
  Settings: Cog,
};

const buildNavItem = (label: string, href: string): NavItem => ({
  label,
  href,
  icon: navIcons[label],
});

const Header = () => {
  const { signOut, user } = useAuth();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();
  const defaultWallet = wallets?.find((w) => w.is_default) || wallets?.[0];
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openSearch = () => setSearchOpen(true);

  const avatarUrl = resolveAvatarUrl(profile, user);
  const avatarInitial = avatarInitials(profile, user);

  const warmRoute = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  const navItems: NavItem[] = [
    buildNavItem("Dashboard", "/dashboard"),
    buildNavItem("Send", "/send"),
    buildNavItem("Payment links", "/payment-links"),
    buildNavItem("Top up", "/wallet/topup"),
    buildNavItem("Contacts", "/contacts"),
    buildNavItem("Exchange", "/exchange"),
    buildNavItem("Wallets", "/wallets"),
    buildNavItem("Cards", "/cards"),
  ];

  if (!isAdmin && isFinance) navItems.push(buildNavItem("Finance", "/finance"));
  if (!isAdmin && (isFinance || isCompliance)) navItems.push(buildNavItem("Operations", "/operations"));
  if (isAdmin) navItems.push(buildNavItem("Admin", "/admin"));

  const countryBadge = profile?.country_code ?? defaultWallet?.currency_code?.slice(0, 2) ?? null;
  const walletFlag = defaultWallet?.flag_emoji;
  const isAsciiFlag = (value: string) => /^[A-Z]{2}$/.test(value);
  const showEmojiFlag = Boolean(walletFlag && !isAsciiFlag(walletFlag));
  const localeDisplay = showEmojiFlag
    ? walletFlag
    : (countryBadge ?? (walletFlag && isAsciiFlag(walletFlag) ? walletFlag : null));

  const isNavActive = (href: string) =>
    href === "/dashboard"
      ? location.pathname === "/" || location.pathname === "/dashboard"
      : location.pathname.startsWith(href) && href !== "#";

  return (
    <TooltipProvider delayDuration={200}>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="container flex items-center h-16 px-3 sm:px-4 gap-3 lg:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  className={`xl:hidden ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.menu}`}
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b border-border">
                  <SheetTitle className="flex items-center gap-2">
                    <Logo className="w-8 h-8" />
                    <Wordmark className="font-display font-bold text-lg" />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-0.5 p-2">
                  {navItems.map((item) => {
                    const isActive = isNavActive(item.href);
                    return (
                      <Link
                        key={item.label}
                        to={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        onMouseEnter={() => warmRoute(item.href)}
                        onFocus={() => warmRoute(item.href)}
                        onTouchStart={() => warmRoute(item.href)}
                        className={navMobileClass(isActive)}
                      >
                        <item.icon className={`w-4 h-4 shrink-0 ${navIconTint(item.label)}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
              <Logo className="w-8 h-8 shrink-0" />
              <Wordmark className="font-display font-bold text-lg truncate hidden sm:inline" />
            </Link>
          </div>

          {/* Desktop nav — full-width pill track */}
          <nav className="hidden xl:flex flex-1 min-w-0">
            <div className={`${headerNavTrack} flex-1 overflow-x-auto no-scrollbar`}>
              {navItems.map((item) => (
                <HeaderNavItem
                  key={item.label}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  isActive={isNavActive(item.href)}
                  onWarmRoute={() => warmRoute(item.href)}
                />
              ))}
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
            <div className="relative hidden lg:flex w-48 xl:w-56 2xl:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={openSearch}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openSearch();
                }}
                placeholder="Search transfers, contacts..."
                aria-label="Search transfers, contacts, wallets"
                className={headerSearchClass}
              />
            </div>
            <button
              onClick={openSearch}
              className={`lg:hidden ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.search}`}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            <span className="hidden lg:block w-px h-8 bg-border/60 mx-0.5" aria-hidden />

            <ThemeToggle />
            <NotificationsPanel />
            <QuickActionsPopover />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={profileTriggerClass}>
                  <Avatar className="h-8 w-8 rounded-md border border-border">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Profile" />
                    <AvatarFallback className="rounded-md gradient-primary text-primary-foreground text-xs font-semibold">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  {localeDisplay && (
                    <span className={profileBadgeClass} title={`Default: ${defaultWallet?.currency_code ?? localeDisplay}`}>
                      {localeDisplay}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">Account</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>Profile Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/kyc")}>KYC Verification</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/security")}>Security</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <SearchModal
          open={searchOpen}
          onOpenChange={setSearchOpen}
          initialQuery={searchQuery}
          onQueryChange={setSearchQuery}
        />
      </header>
    </TooltipProvider>
  );
};

export default Header;
