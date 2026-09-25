import { Link } from "react-router-dom";
import { useTransfers, type Transfer } from "@/hooks/useTransfers";

const RAILS: Record<string, { wallets: string[]; banks: string[] }> = {
  NGN: {
    wallets: ["Moniepoint", "OPay", "Paga", "PalmPay"],
    banks: ["Access", "FirstBank", "Zenith", "GTBank", "UBA"],
  },
  GHS: { wallets: ["MTN", "Vodafone", "AirtelTigo"], banks: ["Bank deposit"] },
  ZMW: { wallets: ["MTN", "Airtel", "Zamtel"], banks: [] },
  KES: { wallets: ["M-Pesa"], banks: ["Bank deposit"] },
  CAD: { wallets: ["Interac e-Transfer"], banks: ["Bank deposit"] },
  USD: { wallets: [], banks: ["Bank deposit", "Card"] },
};

function statusLabel(status: Transfer["status"]): string {
  if (status === "completed") return "Delivered";
  if (status === "failed" || status === "reversed" || status === "expired") return "Failed";
  return "In progress";
}

export function SendCorridorStrip({ currency }: { currency: string }) {
  const rail = RAILS[currency.toUpperCase()] ?? { wallets: ["Mobile money"], banks: ["Bank deposit"] };
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-center text-base font-semibold text-foreground">Rapid, secure transfer</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="mb-2 font-medium text-muted-foreground">Mobile wallets</p>
          <div className="flex flex-wrap gap-1.5">
            {(rail.wallets.length ? rail.wallets : ["—"]).map((name) => (
              <span key={name} className="rounded-md bg-background px-2 py-1 font-medium text-foreground ring-1 ring-border">{name}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-medium text-muted-foreground">Bank accounts {currency.toUpperCase()}</p>
          <div className="flex flex-wrap gap-1.5">
            {(rail.banks.length ? rail.banks : ["—"]).map((name) => (
              <span key={name} className="rounded-md bg-background px-2 py-1 font-medium text-foreground ring-1 ring-border">{name}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecentSends() {
  const { data: transfers = [], isLoading } = useTransfers(4);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <Link to="/transfers" className="text-sm font-medium text-primary">See all</Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recent transfers…</p>
      ) : transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Transfers you send will show up here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {transfers.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.recipient_name}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.created_at.slice(0, 10)}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    {statusLabel(t.status)}
                  </span>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{Number(t.source_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.source_currency}</p>
                <p className="text-muted-foreground">{Number(t.target_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.target_currency}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
