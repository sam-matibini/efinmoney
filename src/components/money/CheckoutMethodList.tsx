import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CheckoutMethod {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface Props {
  methods: CheckoutMethod[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Stripe-style radio rows; the selected row expands to hold its gateway form. */
const CheckoutMethodList = ({ methods, value, onChange, className }: Props) => (
  <div className={cn("divide-y divide-border rounded-xl border border-border overflow-hidden", className)}>
    {methods.map((m) => {
      const selected = m.id === value;
      return (
        <div key={m.id} className={cn(selected && "bg-muted/30")}>
          <button
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={selected}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
          >
            <span
              className={cn(
                "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                selected ? "border-primary" : "border-muted-foreground/40",
              )}
            >
              {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{m.label}</span>
              {m.description && (
                <span className="block text-xs text-muted-foreground truncate">{m.description}</span>
              )}
            </span>
            {m.icon && <span className="shrink-0 text-muted-foreground">{m.icon}</span>}
          </button>
          {selected && <div className="px-4 pb-4">{m.content}</div>}
        </div>
      );
    })}
  </div>
);

export default CheckoutMethodList;
