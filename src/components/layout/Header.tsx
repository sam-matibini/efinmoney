import { useState, useEffect } from "react";
import { motion, LayoutGroup } from "framer-motion";
import {
  Search,
  LogOut,
  Menu,
  Building2,
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
import { useKyb, KybStep } from "@/hooks/useKyb";
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
import SupportLink from "@/components/header/SupportLink";
import QuickActionsPopover from "@/components/layout/QuickActionsPopover";
import SearchModal from "@/components/header/SearchModal";
import HeaderNavItem from "@/components/layout/HeaderNavItem";
import NavIconImage from "@/components/layout/NavIconImage";
import { navIconImgClassMobile } from "@/components/layout/navIconAssets";
import { productFeatures } from "@/lib/productFeatures";
import { Logo, Wordmark } from "@/components/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { prefetchRoute } from "@/lib/prefetchRoute";
import { avatarInitials, resolveAvatarUrl } from "@/lib/avatar";
import { CountryFlag, CurrencyFlag } from "@/components/ui/FlagImage";
import {
  headerIconBase,

  headerIconInteractive,
  headerIconVariants,
  headerNavTrack,
  headerSearchClass,
  navMobileClass,
  profileBadgeClass,
  profileTriggerClass,
} from "@/components/layout/headerStyles";

type NavItem = {
  label: string;
  href: string;
};

const buildNavItem = (label: string, href: string): NavItem => ({ label, href });

const Header = () => {
  const { signOut, user } = useAuth();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const { business, isApproved: hasBusiness } = useKyb();
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
    ...(productFeatures.paymentLinks ? [buildNavItem("Payment Links", "/payment-links")] : []),
    buildNavItem("Top up", "/wallet/topup"),
    buildNavItem("Receive", "/wallet/receive"),
    buildNavItem("Contacts", "/contacts"),
    buildNavItem("Foreign Currency Exchange", "/exchange"),
    buildNavItem("Wallets", "/wallets"),
    ...(productFeatures.cards ? [buildNavItem("Cards", "/cards")] : []),
    ...(hasBusiness ? [buildNavItem("Business", "/business")] : []),
  ];

  // Desktop-reachable business entry (the mobile "More" menu isn't in the
  // desktop nav). State-aware, mirroring BusinessPromptCard routing.
  const bizStepPath: Record<KybStep, string> = {
    details: "/onboarding/business/details",
    ownership: "/onboarding/business/ownership",
    documents: "/onboarding/business/documents",
    review: "/onboarding/business/review",
    completed: "/onboarding/business/details",
  };
  let businessMenuLabel = "Open a business account";
  let businessMenuTarget = "/onboarding/business/details";
  if (business) {
    if (hasBusiness) {
      businessMenuLabel = "Business account";
      businessMenuTarget = "/business";
    } else if (business.kyb_status === "pending_review") {
      businessMenuLabel = "Business application";
      businessMenuTarget = "/onboarding/business/submitted";
    } else if (business.kyb_status === "rejected" || business.kyb_status === "suspended") {
      businessMenuLabel = "Business application";
      businessMenuTarget = "/onboarding/business/rejected";
    } else {
      businessMenuLabel = "Continue business application";
      businessMenuTarget = bizStepPath[business.current_step] ?? "/onboarding/business/details";
    }
  }

  if (!isAdmin && isFinance) navItems.push(buildNavItem("Finance", "/finance"));
  if (!isAdmin && (isFinance || isCompliance)) navItems.push(buildNavItem("Operations", "/operations"));
  if (isAdmin) navItems.push(buildNavItem("Admin", "/admin"));

  const countryBadge = profile?.country_code ?? defaultWallet?.currency_code?.slice(0, 2) ?? null;
  const localeCountry = profile?.country_code ?? null;
  const localeCurrency = defaultWallet?.currency_code ?? null;
  const localeDisplay = localeCountry || localeCurrency;

  const isNavActive = (href: string) =>
    href === "/dashboard"
      ? location.pathname === "/" || location.pathname === "/dashboard"
      : location.pathname.startsWith(href) && href !== "#";

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04, delayChildren: 0.12 } },
  };

  return (
    <TooltipProvider delayDuration={200}>
      <motion.header
        className={`sticky top-0 z-50 border-b overflow-x-hidden backdrop-blur-md supports-[backdrop-filter]:bg-background/75 transition-[border-color,background-color] duration-300 ${
          scrolled
            ? "border-border/80 bg-background/95 shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.18)]"
            : "border-border/60 bg-background/85"
        }`}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="container flex items-center h-14 sm:h-16 min-w-0 w-full max-w-full px-3 sm:px-4 gap-2 sm:gap-3">
          {/* Brand */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className={`lg:hidden ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.menu}`}
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </motion.button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b border-border">
                  <SheetTitle className="flex items-center gap-2">
                    <Logo static className="w-8 h-8" />
                    <Wordmark subtle className="font-display font-bold text-lg" />
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
                        className={navMobileClass(isActive, item.label)}
                      >
                        <NavIconImage label={item.label} className={navIconImgClassMobile} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, type: "spring", stiffness: 400, damping: 28 }}
            >
              <Link
                to="/dashboard"
                className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0 rounded-lg py-1 pr-1 transition-opacity duration-200 hover:opacity-90"
              >
                <Logo static className="w-7 h-7 sm:w-8 sm:h-8" />
                <Wordmark
                  subtle
                  className="font-display font-bold text-base sm:text-lg truncate hidden md:inline"
                />
              </Link>
            </motion.div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex flex-1 min-w-0 mx-1 xl:mx-2">
            <LayoutGroup id="header-nav">
              <motion.div
                className={`${headerNavTrack} flex-1 min-w-0 overflow-x-auto no-scrollbar`}
                variants={navStagger}
                initial="hidden"
                animate="show"
              >
                {navItems.map((item) => (
                  <HeaderNavItem
                    key={item.label}
                    label={item.label}
                    href={item.href}
                    isActive={isNavActive(item.href)}
                    onWarmRoute={() => warmRoute(item.href)}
                  />
                ))}
              </motion.div>
            </LayoutGroup>
          </nav>

          {/* Actions */}
          <motion.div
            className="flex items-center gap-0.5 sm:gap-1 shrink-0 ml-auto lg:ml-0"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.18, type: "spring", stiffness: 380, damping: 30 }}
          >
            <motion.div
              className="relative hidden xl:flex min-w-[10rem] w-40 2xl:w-52 shrink header-search-wrap group"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-colors duration-300 group-focus-within:text-primary" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={openSearch}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openSearch();
                }}
                placeholder="Search..."
                aria-label="Search transfers, contacts, wallets"
                className={headerSearchClass}
              />
            </motion.div>
            <motion.button
              onClick={openSearch}
              whileHover={{ scale: 1.08, y: -1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className={`xl:hidden ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.search}`}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </motion.button>

            <span className="hidden xl:block w-px h-7 sm:h-8 bg-border/60 mx-0.5" aria-hidden />

            <ThemeToggle />
            <SupportLink />
            <NotificationsPanel />
            <div className="hidden xl:block">
              <QuickActionsPopover />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  className={profileTriggerClass}
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 480, damping: 22 }}
                >
                  <Avatar className="h-8 w-8 rounded-md border border-border">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Profile" />
                    <AvatarFallback className="rounded-md gradient-primary text-primary-foreground text-xs font-semibold">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  {localeDisplay && (
                    <span className={profileBadgeClass} title={`Default: ${defaultWallet?.currency_code ?? localeDisplay}`}>
                      {localeCountry
                        ? <CountryFlag country={localeCountry} size="sm" />
                        : <CurrencyFlag code={localeCurrency} size="sm" />}
                    </span>
                  )}
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">Account</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>Home Page</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>Profile Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/kyc")}>KYC Verification</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/security")}>Security</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(businessMenuTarget)}>
                  <Building2 className="w-4 h-4 mr-2" />
                  {businessMenuLabel}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </div>
        <SearchModal
          open={searchOpen}
          onOpenChange={setSearchOpen}
          initialQuery={searchQuery}
          onQueryChange={setSearchQuery}
        />
      </motion.header>
    </TooltipProvider>
  );
};

export default Header;
