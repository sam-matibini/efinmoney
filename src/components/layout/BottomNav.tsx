import { Link } from "react-router-dom";
import { Home, ArrowUpRight, Wallet, RefreshCw, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavModel } from "@/components/layout/useNavModel";

type Item = { label: string; href: string; icon: LucideIcon; color: string; match: string[] };

const ITEMS: Item[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home, color: "var(--color-accent-gold)", match: ["/dashboard"] },
  { label: "Send", href: "/send", icon: ArrowUpRight, color: "var(--color-accent-blue)", match: ["/send"] },
  { label: "Wallets", href: "/wallets", icon: Wallet, color: "var(--color-accent-green)", match: ["/wallets"] },
  { label: "Exchange", href: "/exchange", icon: RefreshCw, color: "var(--color-accent-orange)", match: ["/exchange"] },
  {
    label: "More",
    href: "/more",
    icon: MoreHorizontal,
    color: "var(--color-accent-slate)",
    match: ["/more", "/profile", "/security", "/kyc", "/contacts", "/settings", "/transfers"],
  },
];

/** Mobile (<768px) fixed bottom navigation with the five primary destinations. */
export default function BottomNav() {
  const { isActive, warmRoute } = useNavModel();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-[var(--color-border)] backdrop-blur-xl"
      style={{ backgroundColor: "var(--color-bg-sidebar)", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="flex items-center justify-around px-2 py-2">
        {ITEMS.map((item) => {
          const active = item.href === "/dashboard" ? isActive("/dashboard") : item.match.some((m) => isActive(m));
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onTouchStart={() => warmRoute(item.href)}
              onFocus={() => warmRoute(item.href)}
              className="flex-1 flex flex-col items-center gap-1 py-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
            >
              <span
                className={cn(
                  "flex h-9 w-12 items-center justify-center rounded-xl transition-all duration-150",
                  active && "bg-[rgba(245,166,35,0.14)]",
                )}
              >
                <Icon size={20} style={{ color: active ? "var(--color-accent-gold)" : item.color }} aria-hidden />
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
