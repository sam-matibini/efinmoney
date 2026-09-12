import { ReactNode } from "react";
import { CreditCard, Globe, Landmark, Smartphone, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import CheckoutMethodSidebar from "@/components/money/CheckoutMethodSidebar";
import type { PayTone } from "@/components/money/PaymentMethodRow";

export interface CheckoutMethod {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  tone?: PayTone;
  content: ReactNode;
}

interface Props {
  methods: CheckoutMethod[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Render only the vertical method list (pair with CheckoutShell `methodNav`). */
  navOnly?: boolean;
  title?: string;
}

const toneIcon: Record<PayTone, typeof CreditCard> = {
  card: CreditCard,
  bank: Landmark,
  wallet: Wallet,
  mobile: Smartphone,
  wise: Globe,
};

function methodIcon(m: CheckoutMethod) {
  if (m.icon) return m.icon;
  const Icon = m.tone ? toneIcon[m.tone] : Landmark;
  return <Icon className="h-4 w-4" />;
}

/** Nomba-style split: vertical method list on the left, selected method content on the right. */
const CheckoutMethodList = ({
  methods,
  value,
  onChange,
  className,
  navOnly = false,
  title = "Payment methods",
}: Props) => {
  const selected = methods.find((m) => m.id === value) ?? methods[0];
  const nav = (
    <CheckoutMethodSidebar
      title={title}
      value={selected?.id ?? value}
      onChange={onChange}
      items={methods.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        icon: methodIcon(m),
      }))}
    />
  );

  if (navOnly) return <div className={className}>{nav}</div>;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="grid min-h-[22rem] sm:grid-cols-[minmax(12.5rem,15rem)_minmax(0,1fr)]">
        <aside className="border-b border-border bg-muted/20 sm:border-b-0 sm:border-r">
          {nav}
        </aside>
        <section className="min-w-0 p-5 sm:p-6">{selected?.content}</section>
      </div>
    </div>
  );
};

export default CheckoutMethodList;
