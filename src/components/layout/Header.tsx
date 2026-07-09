import { useState } from "react";
import {
  Search,
  LogOut,
  Shield,
  Wallet,
  Settings,
  Cog,
  X,
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
import { Logo, Wordmark } from "@/components/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { getGreeting } from "@/lib/greeting";
import { prefetchRoute } from "@/lib/prefetchRoute";
import { avatarInitials, resolveAvatarUrl } from "@/lib/avatar";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tone: string;
  activeTone: string;
  hoverTone: string;
};

const navThemes: Record<string, Omit<NavItem, "label" | "href">> = {
  Dashboard: {
    icon: LayoutDashboard,
    tone: "text-violet-500/80 dark:text-violet-400/80",
    activeTone: "text-violet-600 dark:text-violet-300 bg-violet-500/15 shadow-[0_2px_12px_-4px_rgba(139,92,246,0.45)]",
    hoverTone: "hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-500/10",
  },
  Send: {
    icon: Send,
    tone: "text-sky-500/80 dark:text-sky-400/80",
    activeTone: "text-sky-600 dark:text-sky-300 bg-sky-500/15 shadow-[0_2px_12px_-4px_rgba(14,165,233,0.45)]",
    hoverTone: "hover:text-sky-600 dark:hover:text-sky-300 hover:bg-sky-500/10",
  },
  "Payment links": {
    icon: Link2,
    tone: "text-fuchsia-500/80 dark:text-fuchsia-400/80",
    activeTone: "text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-500/15 shadow-[0_2px_12px_-4px_rgba(217,70,239,0.45)]",
    hoverTone: "hover:text-fuchsia-600 dark:hover:text-fuchsia-300 hover:bg-fuchsia-500/10",
  },
  "Top up": {
    icon: ArrowDownToLine,
    tone: "text-emerald-500/80 dark:text-emerald-400/80",
    activeTone: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/15 shadow-[0_2px_12px_-4px_rgba(16,185,129,0.45)]",
    hoverTone: "hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-500/10",
  },
  Contacts: {
    icon: Users,
    tone: "text-cyan-500/80 dark:text-cyan-400/80",
    activeTone: "text-cyan-600 dark:text-cyan-300 bg-cyan-500/15 shadow-[0_2px_12px_-4px_rgba(6,182,212,0.45)]",
    hoverTone: "hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10",
  },
  Exchange: {
    icon: RefreshCw,
    tone: "text-amber-500/80 dark:text-amber-400/80",
    activeTone: "text-amber-600 dark:text-amber-300 bg-amber-500/15 shadow-[0_2px_12px_-4px_rgba(245,158,11,0.45)]",
    hoverTone: "hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-500/10",
  },
  Wallets: {
    icon: Wallet,
    tone: "text-teal-500/80 dark:text-teal-400/80",
    activeTone: "text-teal-600 dark:text-teal-300 bg-teal-500/15 shadow-[0_2px_12px_-4px_rgba(20,184,166,0.45)]",
    hoverTone: "hover:text-teal-600 dark:hover:text-teal-300 hover:bg-teal-500/10",
  },
  Cards: {
    icon: CreditCard,
    tone: "text-orange-500/80 dark:text-orange-400/80",
    activeTone: "text-orange-600 dark:text-orange-300 bg-orange-500/15 shadow-[0_2px_12px_-4px_rgba(249,115,22,0.45)]",
    hoverTone: "hover:text-orange-600 dark:hover:text-orange-300 hover:bg-orange-500/10",
  },
  Finance: {
    icon: Wallet,
    tone: "text-emerald-500/80 dark:text-emerald-400/80",
    activeTone: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/15 shadow-[0_2px_12px_-4px_rgba(16,185,129,0.45)]",
    hoverTone: "hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-500/10",
  },
  Operations: {
    icon: Settings,
    tone: "text-cyan-500/80 dark:text-cyan-400/80",
    activeTone: "text-cyan-600 dark:text-cyan-300 bg-cyan-500/15 shadow-[0_2px_12px_-4px_rgba(6,182,212,0.45)]",
    hoverTone: "hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10",
  },
  Admin: {
    icon: Shield,
    tone: "text-rose-500/80 dark:text-rose-400/80",
    activeTone: "text-rose-600 dark:text-rose-300 bg-rose-500/15 shadow-[0_2px_12px_-4px_rgba(244,63,94,0.45)]",
    hoverTone: "hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10",
  },
  Settings: {
    icon: Cog,
    tone: "text-violet-500/80 dark:text-violet-400/80",
    activeTone: "text-violet-600 dark:text-violet-300 bg-violet-500/15 shadow-[0_2px_12px_-4px_rgba(139,92,246,0.45)]",
    hoverTone: "hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-500/10",
  },
};

const buildNavItem = (label: string, href: string): NavItem => ({
  label,
  href,
  ...navThemes[label],
});

const navLinkClass = (active: boolean, theme: NavItem) =>
  `text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 -mx-2 hover:-translate-y-0.5 active:scale-[0.97] active:opacity-80 ${
    active ? theme.activeTone : `${theme.tone} ${theme.hoverTone}`
  }`;

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
  const [searchExpanded, setSearchExpanded] = useState(false);

  const greeting = getGreeting(profile?.country_code);
  const avatarUrl = resolveAvatarUrl(profile, user);
  const avatarInitial = avatarInitials(profile, user);

  const warmRoute = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  const navItems: NavItem[] = [
    buildNavItem('Dashboard', '/dashboard'),
    buildNavItem('Send', '/send'),
    buildNavItem('Payment links', '/payment-links'),
    buildNavItem('Top up', '/wallet/topup'),
    buildNavItem('Contacts', '/contacts'),
    buildNavItem('Exchange', '/exchange'),
    buildNavItem('Wallets', '/wallets'),
    buildNavItem('Cards', '/cards'),
  ];

  if (!isAdmin && isFinance) {
    navItems.push(buildNavItem('Finance', '/finance'));
  }

  if (!isAdmin && (isFinance || isCompliance)) {
    navItems.push(buildNavItem('Operations', '/operations'));
  }

  if (isAdmin) {
    navItems.push(buildNavItem('Admin', '/admin'));
  }

  const countryBadge = profile?.country_code ?? defaultWallet?.currency_code?.slice(0, 2) ?? null;
  const walletFlag = defaultWallet?.flag_emoji;
  const showWalletFlag = Boolean(walletFlag && walletFlag !== countryBadge && !/^[A-Z]{2}$/.test(walletFlag));

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="container flex items-center justify-between h-16 px-4 gap-2">
        <div className="flex items-center gap-3 min-w-0 shrink">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                className="xl:hidden p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200 hover:scale-110 active:scale-95 shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5 text-primary" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="p-4 border-b border-border">
                <SheetTitle className="flex items-center gap-2">
                  <Logo className="w-8 h-8" />
                  <Wordmark className="font-display font-bold text-lg" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-2">
                {navItems.map((item) => {
                  const isActive = item.href === '/dashboard'
                    ? location.pathname === '/' || location.pathname === '/dashboard'
                    : location.pathname.startsWith(item.href) && item.href !== '#';
                  return (
                    <Link
                      key={item.label}
                      to={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      onMouseEnter={() => warmRoute(item.href)}
                      onFocus={() => warmRoute(item.href)}
                      onTouchStart={() => warmRoute(item.href)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 hover:-translate-y-0.5 active:scale-[0.98] active:opacity-80 ${
                        isActive ? item.activeTone : `${item.tone} ${item.hoverTone}`
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 min-w-0">
            <Logo className="w-9 h-9 shrink-0" />
            <Wordmark className="font-display font-bold text-xl truncate hidden sm:inline" />
          </Link>
          <span className="hidden 2xl:inline-flex items-center gap-1.5 ml-2 pl-3 border-l border-border text-sm font-semibold whitespace-nowrap bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 px-3 py-1 rounded-full">
            <span className="text-base animate-[wave_2.5s_ease-in-out_infinite]">{greeting.emoji}</span>
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300 bg-clip-text text-transparent">
              {greeting.text}
            </span>
          </span>
        </div>

        <nav className="hidden xl:flex items-center gap-3 min-w-0">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? location.pathname === '/' || location.pathname === '/dashboard'
              : location.pathname.startsWith(item.href) && item.href !== '#';
            return (
              <Link
                key={item.label}
                to={item.href}
                onMouseEnter={() => warmRoute(item.href)}
                onFocus={() => warmRoute(item.href)}
                onTouchStart={() => warmRoute(item.href)}
                className={navLinkClass(isActive, item)}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="relative flex items-center">
            {searchExpanded && (
              <input
                key="search-input"
                autoFocus
                placeholder="Search..."
                onBlur={() => setSearchExpanded(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearchExpanded(false);
                    setSearchOpen(true);
                  }
                  if (e.key === "Escape") setSearchExpanded(false);
                }}
                className="h-10 w-[220px] rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mr-1 animate-in fade-in duration-100"
              />
            )}
            <button
              onClick={() => setSearchExpanded((v) => !v)}
              className="p-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 dark:text-sky-400 transition-all duration-200 hover:scale-110 active:scale-95"
              aria-label="Search"
            >
              {searchExpanded ? (
                <X className="w-5 h-5 text-sky-500 dark:text-sky-400" />
              ) : (
                <Search className="w-5 h-5 text-sky-500 dark:text-sky-400" />
              )}
            </button>
          </div>

          <ThemeToggle />
          <NotificationsPanel />
          <QuickActionsPopover />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group ml-1 p-1 pr-2.5 rounded-xl bg-gradient-to-r from-primary/10 via-violet-500/10 to-fuchsia-500/10 hover:from-primary/20 hover:via-violet-500/20 hover:to-fuchsia-500/20 border border-primary/15 transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.45)] active:scale-95 flex items-center gap-2">
                <Avatar className="h-8 w-8 rounded-lg border-2 border-primary/30 group-hover:border-primary/60 transition-colors shadow-[0_0_12px_-4px_hsl(var(--primary)/0.5)]">
                  <AvatarImage src={avatarUrl ?? undefined} alt="Profile" />
                  <AvatarFallback className="rounded-lg gradient-primary text-primary-foreground text-xs font-bold tracking-wide">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
                {(showWalletFlag || countryBadge || walletFlag) && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] font-bold tracking-wider border border-sky-500/25 transition-transform duration-200 group-hover:scale-110 group-hover:bg-sky-500/25"
                    title={`Default: ${defaultWallet?.currency_code ?? countryBadge ?? walletFlag}`}
                  >
                    {showWalletFlag && (
                      <span className="text-sm leading-none">{walletFlag}</span>
                    )}
                    <span>{countryBadge ?? walletFlag}</span>
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
              <DropdownMenuItem onClick={() => navigate('/profile')}>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/kyc')}>KYC Verification</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/security')}>Security</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
};

export default Header;
