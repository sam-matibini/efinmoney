import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, Lock } from "lucide-react";

export interface CheckoutLine {
  label: string;
  sublabel?: string;
  value?: string;
  emphasis?: boolean;
  muted?: boolean;
}

interface CheckoutShellProps {
  /** Small line above the big amount, e.g. "Add money to your CAD wallet" */
  payTo: string;
  /** Big headline amount, already formatted, e.g. "CA$250.00" */
  amount: string;
  amountNote?: string;
  lines?: CheckoutLine[];
  totals?: CheckoutLine[];
  /** Right pane heading */
  heading?: string;
  contactEmail?: string | null;
  children: ReactNode;
  footer?: ReactNode;
  poweredBy?: string;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

const Row = ({ line }: { line: CheckoutLine }) => (
  <div className="flex items-start justify-between gap-6 py-1.5">
    <div className="min-w-0">
      <p className={cn("text-sm", line.emphasis ? "font-semibold" : "", line.muted ? "text-muted-foreground" : "")}>
        {line.label}
      </p>
      {line.sublabel && <p className="text-xs text-muted-foreground mt-0.5">{line.sublabel}</p>}
    </div>
    {line.value !== undefined && (
      <p className={cn("text-sm tabular-nums shrink-0", line.emphasis ? "font-semibold" : "", line.muted ? "text-muted-foreground" : "")}>
        {line.value}
      </p>
    )}
  </div>
);

/**
 * Two-pane checkout surface: order summary rail on the left, payment
 * selection on the right. Stacks on mobile.
 */
const CheckoutShell = ({
  payTo,
  amount,
  amountNote,
  lines = [],
  totals = [],
  heading = "Payment method",
  contactEmail,
  children,
  footer,
  poweredBy,
  onBack,
  backLabel = "Back",
  className,
}: CheckoutShellProps) => (
  <div className={cn("mx-auto w-full max-w-5xl", className)}>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Summary rail */}
      <aside className="bg-secondary/60 border-b lg:border-b-0 lg:border-r border-border px-6 py-7 sm:px-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </button>
        )}
        <p className="text-sm text-muted-foreground">{payTo}</p>
        <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{amount}</p>
        {amountNote && <p className="mt-1.5 text-xs text-muted-foreground">{amountNote}</p>}

        {lines.length > 0 && (
          <div className="mt-7 border-t border-border/70 pt-4">
            {lines.map((l, i) => <Row key={`${l.label}-${i}`} line={l} />)}
          </div>
        )}

        {totals.length > 0 && (
          <div className="mt-4 border-t border-border/70 pt-4">
            {totals.map((l, i) => <Row key={`${l.label}-${i}`} line={l} />)}
          </div>
        )}

        <p className="mt-8 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="w-3 h-3" />
          Secured by eFinMoney
        </p>
      </aside>

      {/* Payment pane */}
      <section className="px-6 py-7 sm:px-8 space-y-6">
        {contactEmail && (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Contact information</p>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground truncate">
              {contactEmail}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold">{heading}</p>
          {children}
        </div>

        {footer}

        {poweredBy && (
          <p className="text-center text-[11px] text-muted-foreground">Powered by {poweredBy}</p>
        )}
      </section>
    </div>
  </div>
);

export default CheckoutShell;
