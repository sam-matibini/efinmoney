import { cn } from "@/lib/utils";
import { Building2, ChevronRight, CreditCard, Link2, Send } from "lucide-react";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";

export type CheckoutMethod = "card" | "interac" | "eft" | "wise" | "plaid" | "loop_billing";

interface Props {
  value?: CheckoutMethod | null;
  onChange: (method: CheckoutMethod) => void;
  /** Interac Autodeposit push to Loop. Default true. */
  interacAvailable?: boolean;
  /** Visa Direct / debit card row. */
  cardAvailable?: boolean;
  /** @deprecated Prefer interacAvailable — Plaid is wired through Interac. */
  plaidAvailable?: boolean;
  eftAvailable?: boolean;
  wiseAvailable?: boolean;
  /** Loop Billing payment link (EFT pull from Loop dashboard URL). */
  loopBillingAvailable?: boolean;
  /** Optional Interac row title override (e.g. Flovide). */
  interacTitle?: string;
  interacDescription?: string;
  lang?: Lang;
}

interface RowProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconClassName: string;
  onSelect: () => void;
}

function MethodRow({ title, description, icon, iconClassName, onSelect }: RowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b px-1 py-5 text-left transition-colors last:border-b-0 hover:bg-muted/40"
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
    </button>
  );
}

/**
 * Zum-style method list: Interac Autodeposit + optional Loop Billing link + card.
 */
export default function CheckoutMethodGrid({
  onChange,
  interacAvailable = true,
  cardAvailable = false,
  plaidAvailable = false,
  eftAvailable = false,
  wiseAvailable = false,
  loopBillingAvailable = false,
  interacTitle,
  interacDescription,
  lang = "en",
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const showInterac = interacAvailable || plaidAvailable;

  return (
    <div className="divide-y border-t">
      {showInterac && (
        <MethodRow
          title={interacTitle ?? t.interac}
          description={interacDescription ?? t.interacDesc}
          icon={<Send className="h-5 w-5 text-white" />}
          iconClassName="bg-emerald-500"
          onSelect={() => onChange(plaidAvailable && !interacAvailable ? "plaid" : "interac")}
        />
      )}
      {loopBillingAvailable && (
        <MethodRow
          title={t.loopbilling}
          description={t.loopbillingDesc}
          icon={<Link2 className="h-5 w-5 text-white" />}
          iconClassName="bg-teal-700"
          onSelect={() => onChange("loop_billing")}
        />
      )}
      {cardAvailable && (
        <MethodRow
          title={t.visaDirect}
          description={t.visaDirectDesc}
          icon={<CreditCard className="h-5 w-5 text-white" />}
          iconClassName="bg-sky-500"
          onSelect={() => onChange("card")}
        />
      )}
      {eftAvailable && (
        <MethodRow
          title={t.eft}
          description={t.eftDesc}
          icon={<Building2 className="h-5 w-5 text-white" />}
          iconClassName="bg-slate-500"
          onSelect={() => onChange("eft")}
        />
      )}
      {wiseAvailable && (
        <MethodRow
          title={t.wise}
          description={t.wiseDesc}
          icon={<CreditCard className="h-5 w-5 text-white" />}
          iconClassName="bg-slate-500"
          onSelect={() => onChange("wise")}
        />
      )}
    </div>
  );
}
