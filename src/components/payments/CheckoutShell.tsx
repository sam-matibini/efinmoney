import { type ReactNode } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import { cn } from "@/lib/utils";

export interface CheckoutSummary {
  payeeName?: string | null;
  payerName?: string | null;
  comment?: string | null;
  amountLabel: string;
  reference?: string | null;
  invoiceId?: string | null;
  invoiceDate?: string | null;
  description?: string | null;
  lineItem?: string | null;
  brandName?: string | null;
}

interface Props {
  summary: CheckoutSummary;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onBack?: () => void;
  /** Show "Select a payment method" under the toolbar (method grid only). */
  showMethodTitle?: boolean;
  /** Hide the EN/FR toggle (e.g. when parent already shows it). */
  hideLangToggle?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Zum-style hosted checkout: invoice summary (left) + payment step (right).
 */
export default function CheckoutShell({
  summary,
  lang,
  onLangChange,
  onBack,
  showMethodTitle = true,
  hideLangToggle = false,
  children,
  className,
}: Props) {
  const t = CHECKOUT_STRINGS[lang];

  return (
    <div className={cn("mx-auto w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <div className="grid gap-0 md:grid-cols-2">
        {/* Left — invoice summary */}
        <div className="relative space-y-4 border-b bg-muted/40 p-6 md:border-b-0 md:border-r">
          {summary.brandName && (
            <p className="absolute right-5 top-5 text-sm font-semibold tracking-tight text-foreground">
              {summary.brandName}
            </p>
          )}

          <div className="space-y-1 pr-16 text-sm">
            {summary.payeeName && (
              <p>
                <span className="text-muted-foreground">{lang === "fr" ? "À : " : "To : "}</span>
                <span className="font-medium uppercase tracking-wide">{summary.payeeName}</span>
              </p>
            )}
            {summary.payerName && (
              <p>
                <span className="text-muted-foreground">{lang === "fr" ? "De : " : "From : "}</span>
                <span className="font-medium">{summary.payerName}</span>
              </p>
            )}
            {(summary.comment || summary.description) && (
              <p>
                <span className="text-muted-foreground">{lang === "fr" ? "Commentaire : " : "Comment : "}</span>
                <span className="font-medium">{summary.comment || summary.description}</span>
              </p>
            )}
          </div>

          {(summary.invoiceId || summary.reference) && (
            <div className="space-y-0.5 pt-2">
              <p className="text-sm font-semibold text-foreground">
                {lang === "fr" ? "N° de facture" : "Invoice ID"}{" "}
                <span className="font-normal break-all">{summary.invoiceId || summary.reference}</span>
              </p>
              {summary.invoiceDate && (
                <p className="text-sm text-muted-foreground">{summary.invoiceDate}</p>
              )}
            </div>
          )}

          <p className="pt-2 text-4xl font-semibold tracking-tight tabular-nums text-foreground">
            {summary.amountLabel}
          </p>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            onClick={() => {
              const blob = new Blob(
                [
                  [
                    summary.brandName || "eFinMoney",
                    `To: ${summary.payeeName || ""}`,
                    `From: ${summary.payerName || ""}`,
                    `Amount: ${summary.amountLabel}`,
                    `Invoice: ${summary.invoiceId || summary.reference || ""}`,
                    `Line: ${summary.lineItem || ""}`,
                  ].join("\n"),
                ],
                { type: "text/plain" },
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `invoice-${summary.invoiceId || summary.reference || "efin"}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {lang === "fr" ? "Télécharger la facture" : "Download Invoice"}
            <Download className="h-3.5 w-3.5" />
          </button>

          {summary.lineItem && (
            <div className="flex items-start justify-between gap-3 border-t pt-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{summary.lineItem}</p>
                <p className="text-xs text-muted-foreground">Qty: 1</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{summary.amountLabel}</p>
            </div>
          )}
        </div>

        {/* Right — payment methods / step */}
        <div className="flex flex-col p-6">
          <div className="mb-1 flex items-center justify-between gap-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={onBack}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t.back}
              </Button>
            ) : (
              <span />
            )}
            {!hideLangToggle && (
              <div className="flex gap-1" role="group" aria-label="Language">
                {(["en", "fr"] as Lang[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onLangChange(code)}
                    aria-pressed={lang === code}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      lang === code
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {code === "en" ? "English" : "Français"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showMethodTitle && (
            <p className="mb-3 text-base font-semibold text-foreground">{t.selectMethod}</p>
          )}
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>

      <p className="border-t py-3 text-center text-[11px] text-muted-foreground">{t.poweredBy}</p>
    </div>
  );
}
