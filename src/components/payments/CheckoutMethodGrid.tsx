import { cn } from "@/lib/utils";
import { Building2, ChevronRight, CreditCard, Send, Wallet } from "lucide-react";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";

export type CheckoutMethod = "card" | "interac" | "eft" | "wise";

interface Props {
  amountLabel?: string;
  value: CheckoutMethod;
  onChange: (method: CheckoutMethod) => void;
  /** Hide the Interac row when the collection currency is not CAD. */
  interacAvailable?: boolean;
  /** Hide the card row when Square does not support the collection currency. */
  cardAvailable?: boolean;
  lang?: Lang;
}


interface RowProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}

function MethodRow({ title, description, icon, selected, onSelect }: RowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 border-b px-3 py-4 text-left transition-colors last:border-b-0",
        selected ? "bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-semibold", selected && "text-primary")}>{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
    </button>
  );
}

/** Hosted-checkout method picker: one row per rail, icon + description + chevron. */
export default function CheckoutMethodGrid({
  amountLabel,
  value,
  onChange,
  interacAvailable = true,
  lang = "en",
}: Props) {
  const t = CHECKOUT_STRINGS[lang];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{t.selectMethod}</span>
        {amountLabel && <span className="text-2xl font-semibold tabular-nums">{amountLabel}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border">
        {interacAvailable && (
          <MethodRow
            title={t.interac}
            description={t.interacDesc}
            icon={<Send className="h-5 w-5" />}
            selected={value === "interac"}
            onSelect={() => onChange("interac")}
          />
        )}
        <MethodRow
          title={t.wise}
          description={t.wiseDesc}
          icon={<Wallet className="h-5 w-5" />}
          selected={value === "wise"}
          onSelect={() => onChange("wise")}
        />
        <MethodRow
          title={t.eft}
          description={t.eftDesc}
          icon={<Building2 className="h-5 w-5" />}
          selected={value === "eft"}
          onSelect={() => onChange("eft")}
        />
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="h-3.5 w-3.5" />
        Visa · Mastercard · Amex · Apple Pay · Google Pay
      </p>
    </div>
  );
}
