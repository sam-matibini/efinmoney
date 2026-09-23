import { Link } from "react-router-dom";
import { Loader2, ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DashboardTransfer } from "@/hooks/useDashboardTransfers";
import { normalizeCountryCode } from "@/lib/flags";

const IN_FLIGHT = new Set([
  "initiated",
  "funded",
  "processing",
  "pending_liquidity",
  "pending_ops",
]);

const STATUS_LABEL: Record<string, string> = {
  initiated: "Started",
  funded: "Funded",
  processing: "Processing",
  pending_liquidity: "Waiting on partner float",
  pending_ops: "Needs ops action",
};

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function filterPendingTransfers(transfers: DashboardTransfer[] | undefined) {
  return (transfers ?? []).filter((t) => IN_FLIGHT.has(t.status));
}

export default function PendingTransfersDialog({
  open,
  onOpenChange,
  transfers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfers: DashboardTransfer[] | undefined;
}) {
  const pending = filterPendingTransfers(transfers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="font-display text-xl">Pending transfers</DialogTitle>
          <DialogDescription>
            {pending.length === 0
              ? "Nothing in transit right now."
              : `${pending.length} send${pending.length === 1 ? "" : "s"} still moving.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {pending.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              All caught up — no pending transfers.
            </p>
          ) : (
            <ul className="space-y-1">
              {pending.map((t) => {
                const cc = normalizeCountryCode(t.recipient_country);
                return (
                  <li key={t.id}>
                    <Link
                      to={`/transfers/${t.id}`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                        {cc ? (
                          <img
                            src={`https://flagcdn.com/w40/${cc}.png`}
                            srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
                            alt={cc}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {t.recipient_name || "Recipient"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {STATUS_LABEL[t.status] || t.status}
                          {t.target_currency ? ` · to ${t.target_currency}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {fmtAmount(Number(t.source_amount || 0), t.source_currency || "USD")}
                        </span>
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-primary">
                          Track <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
