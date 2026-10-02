import { Link } from "react-router-dom";
import { ChevronRight, Eye, EyeOff, Plus } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useHideBalance } from "@/hooks/useHideBalance";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyFlag } from "@/components/ui/FlagImage";

const PRIORITY = ["CAD", "USD", "USDT"];
const MAX_CARDS = 3;
const ACCENTS = ["var(--color-accent-gold)", "var(--color-accent-green)", "var(--color-accent-emerald)"];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Row 4 left: primary wallet cards (CAD / USD / USDT first). */
export default function WalletsPanel() {
  const { data: wallets, isLoading } = useWallets();
  const [hidden, setHidden] = useHideBalance();

  const sorted = [...(wallets ?? [])].sort((a, b) => {
    const ra = PRIORITY.indexOf(a.currency_code);
    const rb = PRIORITY.indexOf(b.currency_code);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || Number(b.balance) - Number(a.balance);
  });
  const shown = sorted.slice(0, MAX_CARDS);

  return (
    <section aria-labelledby="wallets-panel-title" className="rounded-[var(--radius-lg)] bg-[var(--color-bg-sidebar)] p-5 h-full">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="wallets-panel-title" className="text-[var(--font-size-lg)] font-semibold text-[var(--color-text-primary)]">
          Wallets
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <Link
            to="/wallets"
            className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium text-[var(--color-accent-gold)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          >
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Link
          to="/wallets"
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] py-10 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
        >
          <Plus className="h-5 w-5" /> Open your first wallet
        </Link>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {shown.map((w, i) => (
            <Link
              key={w.wallet_id}
              to={`/wallets?wallet=${w.wallet_id}`}
              className="group flex flex-col justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--color-bg-card)] p-4 transition-transform duration-200 hover:scale-[1.02] hover:bg-[var(--color-bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
              style={{ borderTop: `3px solid ${ACCENTS[i % ACCENTS.length]}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CurrencyFlag code={w.currency_code} size="sm" />
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{w.currency_code}</span>
                </span>
                {w.is_default && (
                  <span className="rounded-full bg-[rgba(245,166,35,0.15)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-accent-gold)]">
                    Default
                  </span>
                )}
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-[var(--color-text-primary)]">
                  {hidden ? "••••••" : `${w.symbol ?? ""}${fmt(Number(w.balance))}`}
                </p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{w.currency_name}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
