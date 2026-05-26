import { motion } from "framer-motion";
import { Home, CreditCard, Activity, MoreHorizontal } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Home", href: "/dashboard", match: ["/dashboard", "/"] },
  { icon: CreditCard, label: "Cards", href: "/cards", match: ["/cards"] },
  { icon: Activity, label: "History", href: "/transfers", match: ["/transfers", "/transactions"] },
  { icon: MoreHorizontal, label: "More", href: "/more", match: ["/more", "/profile", "/security", "/kyc", "/contacts", "/settings"] },
];

const MobileNav = () => {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around py-2 px-2">
        {navItems.map((item) => {
          const isActive = item.match.some((m) =>
            m === "/" ? location.pathname === "/" : location.pathname.startsWith(m)
          );

          return (
            <Link key={item.label} to={item.href} className="flex-1 flex justify-center">
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center gap-1 py-1.5 px-2 min-w-[56px]"
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-2xl transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.6)]"
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "" : "stroke-[1.75]"}`} />
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
