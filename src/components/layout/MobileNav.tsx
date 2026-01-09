import { motion } from "framer-motion";
import { Home, Wallet, Send, RefreshCw, CreditCard } from "lucide-react";

const navItems = [
  { icon: Home, label: 'Home', active: true },
  { icon: Wallet, label: 'Wallets', active: false },
  { icon: Send, label: 'Send', active: false },
  { icon: RefreshCw, label: 'Exchange', active: false },
  { icon: CreditCard, label: 'Cards', active: false },
];

const MobileNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 md:hidden">
      <div className="flex items-center justify-around py-3 px-4">
        {navItems.map((item, index) => (
          <motion.button
            key={item.label}
            whileTap={{ scale: 0.9 }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              item.active 
                ? 'text-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className={`p-2 rounded-xl transition-all ${
              item.active ? 'gradient-primary shadow-glow' : ''
            }`}>
              <item.icon className={`w-5 h-5 ${item.active ? 'text-primary-foreground' : ''}`} />
            </div>
            <span className="text-xs font-medium">{item.label}</span>
          </motion.button>
        ))}
      </div>
    </nav>
  );
};

export default MobileNav;
