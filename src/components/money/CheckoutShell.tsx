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
  /** Right pane heading (ignored when `methodNav` is set). */
  heading?: string;
  contactEmail?: string | null;
  children: ReactNode;
  footer?: ReactNode;
  poweredBy?: string;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  /**
   * Nomba-style vertical method list. When set, methods sit on the left and
   * the amount / selected method sit on the right.
   */
  methodNav?: ReactNode;
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
  methodNav,
}: CheckoutShellProps) => {
  if (methodNav) {
    return (
      <div className={cn("mx-auto w-full max-w-5xl", className)}>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid min-h-[28rem] grid-cols-1 sm:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
            <aside className="border-b border-border bg-muted/20 sm:border-b-0 sm:border-r">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="mx-4 mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {backLabel}
                </button>
              )}
              {methodNav}
            </aside>

            <section className="flex min-w-0 flex-col">
              <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
                <div className="min-w-0">
                  {contactEmail && (
                    <p className="truncate text-sm font-medium">{contactEmail}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{payTo}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{amount}</p>
                  {amountNote && (
                    <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-muted-foreground">{amountNote}</p>
                  )}
                </div>
              </header>

              {(lines.length > 0 || totals.length > 0) && (
                <div className="mx-5 mt-4 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 sm:mx-8">
                  {lines.map((l, i) => <Row key={`${l.label}-${i}`} line={l} />)}
                  {totals.map((l, i) => <Row key={`t-${l.label}-${i}`} line={l} />)}
                </div>
              )}

              <div className="flex-1 space-y-5 px-5 py-5 sm:px-8 sm:py-6">
                {children}
                {footer}
              </div>

              <p className="px-5 pb-4 text-[11px] text-muted-foreground sm:px-8">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Secured by eFinMoney
                </span>
                {poweredBy ? <span className="ml-2">· Powered by {poweredBy}</span> : null}
              </p>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <aside className="border-b border-border bg-secondary/60 px-6 py-7 sm:px-8 lg:border-b-0 lg:border-r">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
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
            <Lock className="h-3 w-3" />
            Secured by eFinMoney
          </p>
        </aside>

        <section className="space-y-6 px-6 py-7 sm:px-8">
          {contactEmail && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Contact information</p>
              <div className="truncate rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
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
};

export default CheckoutShell;
