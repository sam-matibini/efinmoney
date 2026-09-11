import { formatCustomerRate, type TransferQuote } from "@/lib/pricing/costRecoveryEngine";

function money(amount: number, currency: string) {
  const code = currency === "USDC" || currency === "USDT" ? currency : currency;
  try {
    if (code.length === 3 && code !== "USDC") {
      return new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).format(amount);
    }
  } catch {
    /* fall through */
  }
  return `${code} ${amount.toFixed(2)}`;
}

type Props = {
  quote: TransferQuote;
  sourceSymbol?: string;
  destSymbol?: string;
  rateLabel?: string;
  compact?: boolean;
};

export default function TransferSummary({ quote, rateLabel, compact }: Props) {
  if (quote.amount <= 0) return null;
  const rateText =
    rateLabel ||
    (quote.customerRate
      ? `1 ${quote.sourceCurrency} = ${formatCustomerRate(quote.customerRate)} ${quote.destinationCurrency}`
      : "Rate unavailable");

  return (
    <div className={`rounded-xl border border-border/60 bg-muted/30 text-sm ${compact ? "p-3 space-y-1.5" : "p-4 space-y-2"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transfer summary</p>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">You send</span>
        <span className="tabular-nums font-medium">{money(quote.youSend, quote.feeCurrency)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Exchange rate</span>
        <span className="min-w-0 truncate text-right tabular-nums">{rateText}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Transfer fee</span>
        <span className="tabular-nums">{money(quote.transferFee, quote.feeCurrency)}</span>
      </div>
      {quote.channel === "external" && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Total charged</span>
          <span className="tabular-nums font-medium">{money(quote.totalCharged, quote.feeCurrency)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-border/60 pt-2 font-semibold">
        <span>You receive</span>
        <span className="min-w-0 truncate text-right text-primary tabular-nums">
          {quote.youReceive == null ? "—" : `${quote.destinationCurrency} ${quote.youReceive.toFixed(2)}`}
        </span>
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>Estimated delivery</span>
        <span>{quote.estimatedDelivery}</span>
      </div>
    </div>
  );
}
