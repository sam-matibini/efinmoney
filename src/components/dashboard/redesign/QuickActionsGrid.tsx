import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Landmark, PlusCircle, RefreshCw, Wallet } from "lucide-react";
import QuickActionDrawer, { type QuickActionType } from "@/components/dashboard/redesign/QuickActionDrawer";

const ACTIONS: Array<{
  label: string;
  icon: typeof ArrowUpRight;
  color: string;
  action?: QuickActionType;
  href?: string;
}> = [
  { label: "Send Money", icon: ArrowUpRight, color: "var(--color-accent-blue)", action: "send" },
  { label: "Top Up", icon: PlusCircle, color: "var(--color-accent-emerald)", action: "topup" },
  { label: "Request", icon: ArrowDownLeft, color: "var(--color-accent-purple)", action: "request" },
  { label: "Exchange", icon: RefreshCw, color: "var(--color-accent-orange)", action: "exchange" },
  { label: "Wallets", icon: Wallet, color: "var(--color-accent-green)", href: "/wallets" },
  { label: "Bank", icon: Landmark, color: "var(--color-accent-pink)", href: "/wallet/receive" },
];

type QuickActionsGridProps = {
  currency: string;
};

const QuickActionsGrid = ({ currency }: QuickActionsGridProps) => {
  const navigate = useNavigate();
  const [action, setAction] = useState<QuickActionType | null>(null);

  return (
    <section className="dash-panel" aria-label="Quick actions">
      <h2 className="panel-title">Quick Actions</h2>
      <div className="qa-grid">
        {ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className="qa-btn"
              onClick={() => {
                if (item.action) setAction(item.action);
                else if (item.href) navigate(item.href);
              }}
            >
              <Icon size={24} color={item.color} aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <QuickActionDrawer action={action} currency={currency} onClose={() => setAction(null)} />
    </section>
  );
};

export default QuickActionsGrid;
