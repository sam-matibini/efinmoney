import { useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, PlusCircle, ArrowDownLeft, RefreshCw, Wallet, Landmark, FileText, Users } from "lucide-react";
import { productFeatures } from "@/lib/productFeatures";
import QuickActionDrawer, { type QuickActionType } from "@/components/dashboard/QuickActionDrawer";

type Item =
  | { kind: "drawer"; action: QuickActionType; icon: LucideIcon; label: string; color: string }
  | { kind: "link"; to: string; icon: LucideIcon; label: string; color: string };

const requestOrFallback: Item = productFeatures.requestMoney
  ? { kind: "drawer", action: "request", icon: ArrowDownLeft, label: "Request", color: "var(--color-accent-purple)" }
  : productFeatures.billPay
    ? { kind: "link", to: "/pay-bills", icon: FileText, label: "Bills", color: "var(--color-accent-yellow)" }
    : { kind: "link", to: "/contacts", icon: Users, label: "Contacts", color: "var(--color-accent-lightblue)" };

const ITEMS: Item[] = [
  { kind: "drawer", action: "send", icon: ArrowUpRight, label: "Send Money", color: "var(--color-accent-blue)" },
  { kind: "drawer", action: "topup", icon: PlusCircle, label: "Top Up", color: "var(--color-accent-emerald)" },
  requestOrFallback,
  { kind: "drawer", action: "exchange", icon: RefreshCw, label: "Exchange", color: "var(--color-accent-orange)" },
  { kind: "link", to: "/wallets", icon: Wallet, label: "Wallets", color: "var(--color-accent-green)" },
  { kind: "link", to: "/wallet/receive", icon: Landmark, label: "Bank", color: "var(--color-accent-pink)" },
];

const tileCls =
  "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-card)] p-4 min-h-[88px] transition-transform duration-200 hover:scale-[1.04] hover:bg-[var(--color-bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]";

function TileInner({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color: string }) {
  return (
    <>
      <Icon className="h-6 w-6" style={{ color }} aria-hidden />
      <span className="text-[13px] font-medium text-[var(--color-text-primary)] text-center leading-tight">{label}</span>
    </>
  );
}

const QuickActions = () => {
  const [action, setAction] = useState<QuickActionType | null>(null);

  return (
    <section aria-labelledby="quick-actions-title" className="rounded-[var(--radius-lg)] bg-[var(--color-bg-sidebar)] p-5 h-full">
      <h2 id="quick-actions-title" className="mb-4 text-[var(--font-size-lg)] font-semibold text-white">
        Quick Actions
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {ITEMS.map((item) =>
          item.kind === "drawer" ? (
            <button key={item.label} type="button" onClick={() => setAction(item.action)} className={tileCls}>
              <TileInner icon={item.icon} label={item.label} color={item.color} />
            </button>
          ) : (
            <Link key={item.label} to={item.to} className={tileCls}>
              <TileInner icon={item.icon} label={item.label} color={item.color} />
            </Link>
          ),
        )}
      </div>
      <QuickActionDrawer actionType={action} onClose={() => setAction(null)} />
    </section>
  );
};

export default QuickActions;
