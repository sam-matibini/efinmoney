import { ArrowLeftRight, Home, MoreHorizontal, Send, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { prefetchRoute } from "@/lib/prefetchRoute";

const navItems = [
  { icon: Home, label: "Dashboard", href: "/dashboard", match: ["/dashboard", "/"] },
  { icon: Send, label: "Send", href: "/send", match: ["/send"] },
  { icon: Wallet, label: "Wallets", href: "/wallets", match: ["/wallets"] },
  { icon: ArrowLeftRight, label: "Exchange", href: "/exchange", match: ["/exchange"] },
  { icon: MoreHorizontal, label: "More", href: "/more", match: ["/more", "/profile", "/security", "/kyc", "/contacts", "/settings"] },
] as const;

const MobileNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const warmRoute = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  return (
    <nav className="efm-bottom-nav" aria-label="Primary mobile">
      <div className="efm-bottom-nav-row">
        {navItems.map((item) => {
          const isActive = item.match.some((path) =>
            path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`),
          );
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.href}
              className={isActive ? "efm-bottom-link is-active" : "efm-bottom-link"}
              aria-current={isActive ? "page" : undefined}
              onMouseEnter={() => warmRoute(item.href)}
              onFocus={() => warmRoute(item.href)}
              onTouchStart={() => warmRoute(item.href)}
            >
              <Icon size={20} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
