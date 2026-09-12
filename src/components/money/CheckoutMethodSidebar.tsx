import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CheckoutNavItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface Props {
  items: CheckoutNavItem[];
  value: string;
  onChange: (id: string) => void;
  title?: string;
  className?: string;
}

/**
 * Nomba-style vertical payment-method list: icon + label, selected row
 * highlighted with a left accent bar.
 */
export default function CheckoutMethodSidebar({
  items,
  value,
  onChange,
  title = "Payment methods",
  className,
}: Props) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={title} className={cn("flex h-full flex-col py-2", className)}>
      <p className="px-4 pb-2 pt-1 text-sm font-medium text-foreground">{title}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-40",
                selected
                  ? "border-l-[hsl(var(--accent-amber))] bg-[hsl(var(--accent-amber)/0.14)] text-foreground"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  selected
                    ? "bg-[hsl(var(--accent-amber))] text-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm leading-snug", selected ? "font-semibold" : "font-medium")}>
                  {item.label}
                </span>
                {item.description && (
                  <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground line-clamp-2">
                    {item.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
