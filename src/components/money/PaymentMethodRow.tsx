import { ComponentType } from "react";
import { cn } from "@/lib/utils";

export type PayTone = "card" | "bank" | "wallet" | "mobile" | "wise";

export interface PaymentMethodOption<T extends string = string> {
  id: T;
  label: string;
  sublabel?: string;
  icon: ComponentType<{ className?: string }>;
  tone: PayTone;
  disabled?: boolean;
}

interface Props<T extends string = string> {
  options: PaymentMethodOption<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

const toneSelected: Record<PayTone, string> = {
  card: "border-pay-card bg-pay-card text-pay-card-foreground shadow-sm",
  bank: "border-pay-bank bg-pay-bank text-pay-bank-foreground shadow-sm",
  wallet: "border-pay-wallet bg-pay-wallet text-pay-wallet-foreground shadow-sm",
  mobile: "border-pay-mobile bg-pay-mobile text-pay-mobile-foreground shadow-sm",
  wise: "border-pay-wise bg-pay-wise text-pay-wise-foreground shadow-sm",
};

const toneIdle: Record<PayTone, string> = {
  card: "border-pay-card/30 bg-pay-card/5 text-foreground hover:bg-pay-card/10",
  bank: "border-pay-bank/30 bg-pay-bank/5 text-foreground hover:bg-pay-bank/10",
  wallet: "border-pay-wallet/30 bg-pay-wallet/5 text-foreground hover:bg-pay-wallet/10",
  mobile: "border-pay-mobile/30 bg-pay-mobile/5 text-foreground hover:bg-pay-mobile/10",
  wise: "border-pay-wise/30 bg-pay-wise/5 text-foreground hover:bg-pay-wise/10",
};

const toneIcon: Record<PayTone, string> = {
  card: "text-pay-card",
  bank: "text-pay-bank",
  wallet: "text-pay-wallet",
  mobile: "text-pay-mobile",
  wise: "text-pay-wise",
};

/** Colour-coded checkout method selector shown at the top of money flows. */
function PaymentMethodRow<T extends string = string>({ options, value, onChange, className }: Props<T>) {
  if (options.length === 0) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Payment method"
      className={cn("grid gap-2", options.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : options.length >= 3 ? "grid-cols-3" : "grid-cols-2", className)}
    >
      {options.map((o) => {
        const selected = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 transition-colors disabled:opacity-40 disabled:pointer-events-none",
              selected ? toneSelected[o.tone] : toneIdle[o.tone],
            )}
          >
            <Icon className={cn("w-5 h-5", selected ? "" : toneIcon[o.tone])} />
            <span className="text-sm font-semibold leading-none">{o.label}</span>
            {o.sublabel && (
              <span className={cn("text-[10px] leading-tight text-center", selected ? "opacity-80" : "text-muted-foreground")}>
                {o.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default PaymentMethodRow;
