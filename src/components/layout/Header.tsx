import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, LogOut, Shield, Wallet, Settings, Cog, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationsPanel from "@/components/header/NotificationsPanel";
import SearchModal from "@/components/header/SearchModal";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useWallets } from "@/hooks/useWallets";

const Header = () => {
  const { signOut, user } = useAuth();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/' },
    { label: 'Send', href: '/send' },
    { label: '🇨🇦 Top up', href: '/transfers/canada' },
    { label: 'Contacts', href: '/contacts' },
    { label: 'Exchange', href: '/exchange' },
    { label: 'Wallets', href: '/wallets' },
    { label: 'Cards', href: '/cards' },
  ];

  if (isFinance || isAdmin) {
    navItems.push({ label: 'Finance', href: '/finance' });
  }

  if (isAdmin || isFinance || isCompliance) {
    navItems.push({ label: 'Operations', href: '/operations' });
  }

  if (isAdmin) {
    navItems.push({ label: 'Admin', href: '/admin' });
    navItems.push({ label: 'Settings', href: '/settings' });
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="container flex items-center justify-between h-16 px-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <Link to="/" className="flex items-center gap-3">
            <div className="gradient-primary w-10 h-10 rounded-xl flex items-center justify-center shadow-glow">
              <span className="text-xl font-bold text-primary-foreground">e</span>
            </div>
            <span className="font-display font-bold text-xl text-foreground">eFinMoney</span>
          </Link>
        </motion.div>

        <motion.nav 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden md:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const isActive = item.href === '/' 
              ? location.pathname === '/' 
              : location.pathname.startsWith(item.href) && item.href !== '#';
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label === 'Finance' && <Wallet className="w-4 h-4" />}
                {item.label === 'Operations' && <Settings className="w-4 h-4" />}
                {item.label === 'Admin' && <Shield className="w-4 h-4" />}
                {item.label === 'Settings' && <Cog className="w-4 h-4" />}
                {item.label}
              </Link>
            );
          })}
        </motion.nav>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2"
        >
          <div className="relative flex items-center">
            <AnimatePresence initial={false}>
              {searchExpanded && (
                <motion.input
                  key="search-input"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 220, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mr-1"
                />
              )}
            </AnimatePresence>
            <button
              onClick={() => setSearchExpanded((v) => !v)}
              className="p-2.5 rounded-xl hover:bg-muted transition-colors"
              aria-label="Search"
            >
              {searchExpanded ? (
                <X className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Search className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </div>

          <ThemeToggle />
          <NotificationsPanel />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 p-1 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors group">
                <div className="relative w-8 h-8 rounded-lg gradient-primary flex items-center justify-center transition-shadow group-hover:shadow-[0_0_0_4px_hsl(var(--primary)/0.2)]">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
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
        </motion.div>
      </div>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
};

export default Header;
