import { motion } from "framer-motion";
import { Home, Wallet, Send, RefreshCw, CreditCard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Wallet, label: 'Wallets', href: '/wallets' },
  { icon: Send, label: 'Send', href: '/send' },
  { icon: RefreshCw, label: 'Exchange', href: '/exchange' },
  { icon: CreditCard, label: 'Cards', href: '/cards' },
];

const MobileNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 md:hidden">
      <div className="flex items-center justify-around py-3 px-4">
        {navItems.map((item) => {
          const isActive = item.href === '/' 
            ? location.pathname === '/' 
            : location.pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.label}
              to={item.href}
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className={`p-2 rounded-xl transition-all ${
                  isActive ? 'gradient-primary shadow-glow' : ''
                }`}>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : ''}`} />
                </div>
                <span className="text-xs font-medium">{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
