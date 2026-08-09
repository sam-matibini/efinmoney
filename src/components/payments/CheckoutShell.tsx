import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import { cn } from "@/lib/utils";

export interface CheckoutSummary {
  payeeName?: string | null;
  payerName?: string | null;
  amountLabel: string;
  reference?: string | null;
  description?: string | null;
  lineItem?: string | null;
}

interface Props {
  summary: CheckoutSummary;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onBack?: () => void;
  children: ReactNode;
}

/**
 * Hosted-checkout shell: fixed order summary on the left, the active payment
 * step on the right, with a language toggle and provider footer.
 */
export default function CheckoutShell({ summary, lang, onLangChange, onBack, children }: Props) {
  const t = CHECKOUT_STRINGS[lang];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t.back}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Language">
          {(["en", "fr"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onLangChange(code)}
              aria-pressed={lang === code}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                lang === code ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {code === "en" ? "English" : "Français"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        <div className="space-y-2 border-b p-5 text-sm md:border-b-0 md:border-r">
          {summary.payeeName && (
            <p>
              <span className="text-muted-foreground">To: </span>
              {summary.payeeName}
            </p>
          )}
          {summary.payerName && (
            <p>
              <span className="text-muted-foreground">From: </span>
              {summary.payerName}
            </p>
          )}
          {summary.description && <p className="text-muted-foreground">{summary.description}</p>}
          {summary.reference && (
            <p className="break-all text-xs text-muted-foreground">{summary.reference}</p>
          )}
          <p className="pt-2 text-3xl font-semibold tabular-nums">{summary.amountLabel}</p>
          {summary.lineItem && (
            <div className="flex justify-between pt-2 text-xs text-muted-foreground">
              <span>{summary.lineItem}</span>
              <span className="tabular-nums">{summary.amountLabel}</span>
            </div>
          )}
        </div>

        <div className="p-5">{children}</div>
      </div>

      <p className="border-t py-2 text-center text-[11px] text-muted-foreground">{t.poweredBy}</p>
    </div>
  );
}
