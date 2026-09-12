import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PartnerRailBalance } from "@/lib/partnerRails";

const fmt = (n: number, ccy: string) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

export default function PartnerRailsPanel({
  rails,
  fetchedAt,
  loading,
  error,
  onRefresh,
}: {
  rails: PartnerRailBalance[];
  fetchedAt?: string | null;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Partner rails</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live disbursement balances from Fincra, Verto, and Nomba. Withdraw and same-company
            bank sends use these rails when the partner wallet can cover the amount.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={onRefresh}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {loading && !rails.length ? (
        <p className="text-sm text-muted-foreground">Fetching partner balances…</p>
      ) : rails.length === 0 ? (
        <p className="text-sm text-muted-foreground">No partner balances yet. Check API secrets and retry.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rails.map((r) => (
            <div
              key={`${r.partner}-${r.currency_code}-${r.label}`}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  <Badge variant="outline">{r.currency_code}</Badge>
                  {r.can_payout ? (
                    <Badge>Bank payout</Badge>
                  ) : (
                    <Badge variant="secondary">Balance only</Badge>
                  )}
                </div>
                {r.error && <p className="text-[11px] text-destructive truncate">{r.error}</p>}
                {r.source === "unconfigured" && (
                  <p className="text-[11px] text-muted-foreground">API keys not set</p>
                )}
                {r.source === "mock" && (
                  <p className="text-[11px] text-muted-foreground">Sandbox / mock balance</p>
                )}
              </div>
              <p className="text-sm font-semibold tabular-nums shrink-0">
                {fmt(Number(r.available), r.currency_code)}
              </p>
            </div>
          ))}
        </div>
      )}
      {fetchedAt && (
        <p className="text-[11px] text-muted-foreground">
          Updated {new Date(fetchedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
