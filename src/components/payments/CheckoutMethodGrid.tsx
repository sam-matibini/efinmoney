import { cn } from "@/lib/utils";
import { Building2, CreditCard, Smartphone } from "lucide-react";
import InteracMethodCard from "@/components/payments/InteracMethodCard";

export type CheckoutMethod = "interac" | "eft";

interface Props {
  amountLabel?: string;
  value: CheckoutMethod;
  onChange: (method: CheckoutMethod) => void;
  /** Hide the Interac tile when the collection currency is not CAD. */
  interacAvailable?: boolean;
}

/**
 * Square-style method selection: card brands and wallets shown as the familiar
 * accepted-payment rows, with the bank rails as selectable methods.
 */
export default function CheckoutMethodGrid({
  amountLabel,
  value,
  onChange,
  interacAvailable = true,
}: Props) {
  return (
    <div className="space-y-4">
      {amountLabel && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Amount due</span>
          <span className="text-2xl font-semibold tabular-nums">{amountLabel}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          Visa · Mastercard · Amex
        </div>
        <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Smartphone className="h-4 w-4" />
          Apple Pay · Google Pay
        </div>
      </div>

      <div className="space-y-2">
        {interacAvailable && (
          <InteracMethodCard selected={value === "interac"} onSelect={() => onChange("interac")} />
        )}
        <button
          type="button"
          onClick={() => onChange("eft")}
          aria-pressed={value === "eft"}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
            value === "eft" ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50",
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Bank EFT</span>
            <span className="block text-xs text-muted-foreground">
              Direct bank deposit — arrives in 1-2 business days
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
