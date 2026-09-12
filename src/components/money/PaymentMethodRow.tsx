import { ComponentType } from "react";
import CheckoutMethodSidebar from "@/components/money/CheckoutMethodSidebar";

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
  title?: string;
}

/** Vertical checkout method selector (Nomba-style sidebar). */
function PaymentMethodRow<T extends string = string>({
  options,
  value,
  onChange,
  className,
  title = "Payment methods",
}: Props<T>) {
  if (options.length === 0) return null;

  return (
    <CheckoutMethodSidebar
      title={title}
      className={className}
      value={value}
      onChange={(id) => onChange(id as T)}
      items={options.map((o) => {
        const Icon = o.icon;
        return {
          id: o.id,
          label: o.label,
          description: o.sublabel,
          disabled: o.disabled,
          icon: <Icon className="h-4 w-4" />,
        };
      })}
    />
  );
}

export default PaymentMethodRow;
