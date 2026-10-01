import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Briefcase, Landmark, PlusCircle, RefreshCw, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useKyb } from "@/hooks/useKyb";
import { prefetchRoute } from "@/lib/prefetchRoute";
import { businessAccountLabel, kybResumePath } from "@/lib/kybOnboarding";

const ACTIONS: Array<{
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
}> = [
  { label: "Send Money", href: "/send", icon: ArrowUpRight, color: "var(--color-accent-blue)" },
  { label: "Top Up", href: "/wallet/topup", icon: PlusCircle, color: "var(--color-accent-emerald)" },
  { label: "Request", href: "/request-money", icon: ArrowDownLeft, color: "var(--color-accent-purple)" },
  { label: "Exchange", href: "/exchange", icon: RefreshCw, color: "var(--color-accent-orange)" },
  { label: "Wallets", href: "/wallets", icon: Wallet, color: "var(--color-accent-green)" },
  { label: "Bank", href: "/wallet/receive", icon: Landmark, color: "var(--color-accent-pink)" },
];

const QuickActionsGrid = () => {
  const { user } = useAuth();
  const { business } = useKyb();
  const queryClient = useQueryClient();
  const businessHref = kybResumePath(business);
  const shortcuts = [
    ...ACTIONS,
    {
      label: businessAccountLabel(business),
      href: businessHref,
      icon: Briefcase,
      color: "var(--color-accent-violet)",
    },
  ];

  const warm = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  return (
    <section className="dash-panel" aria-label="Quick actions">
      <h2 className="panel-title">Quick Actions</h2>
      <div className="qa-grid">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.label}
              to={item.href}
              className="qa-btn"
              onMouseEnter={() => warm(item.href)}
              onFocus={() => warm(item.href)}
            >
              <Icon size={24} color={item.color} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default QuickActionsGrid;
