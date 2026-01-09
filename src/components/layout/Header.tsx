import { motion } from "framer-motion";
import { Bell, Search, User, LogOut, Shield, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Link, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const { signOut, user } = useAuth();
  const { isAdmin, isFinance } = useUserRoles();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', href: '/' },
    { label: 'Wallets', href: '#' },
    { label: 'Send', href: '#' },
    { label: 'Exchange', href: '#' },
    { label: 'Cards', href: '#' },
  ];

  if (isFinance) {
    navItems.push({ label: 'Finance', href: '/finance' });
  }

  if (isAdmin) {
    navItems.push({ label: 'Admin', href: '/admin' });
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
                {item.label === 'Admin' && <Shield className="w-4 h-4" />}
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
          <button className="p-2.5 rounded-xl hover:bg-muted transition-colors">
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>
          <button className="relative p-2.5 rounded-xl hover:bg-muted transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full" />
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-2 p-1 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
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
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>KYC Verification</DropdownMenuItem>
              <DropdownMenuItem>Security</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </div>
    </header>
  );
};

export default Header;
