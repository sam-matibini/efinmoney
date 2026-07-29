import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TopUpMethodOption = {
  id: string;
  title: string;
  description: string;
  /** Short benefit tag (e.g. Fast, In-app) — never a vendor name. */
  benefit?: string;
  /** Processor name — only rendered when `showProvider` is true (staff). */
  provider?: string;
  /** Greyed out — visible but not selectable. */
  comingSoon?: boolean;
  icon: LucideIcon;
};

type Props = {
  title?: string;
  description?: string;
  options: TopUpMethodOption[];
  value: string;
  onChange: (id: string) => void;
  /** When true, show muted processor chips (admin/finance/compliance only). */
  showProvider?: boolean;
  className?: string;
};

/**
 * White-label payment method list — vertical radio rows.
 * Processor names are optional and intended for staff only via `showProvider`.
 */
export default function TopUpMethodPicker({
  title = "2. How would you like to pay?",
  description,
  options,
  value,
  onChange,
  showProvider = false,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm",
        className,
      )}
    >
      <header className="px-4 sm:px-6 pt-5 pb-4">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">{description}</p>
        ) : null}
        {showProvider ? (
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-400/80">
            Staff view — processor labels visible to you only
          </p>
        ) : null}
      </header>

      <div
        role="radiogroup"
        aria-label={title}
        className="mx-3 sm:mx-4 mb-4 sm:mb-5 rounded-xl border border-border/70 bg-muted/20 divide-y divide-border/70 overflow-hidden"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.id && !opt.comingSoon;
          const disabled = !!opt.comingSoon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onChange(opt.id);
              }}
              className={cn(
                "relative w-full flex items-center gap-3.5 sm:gap-4 px-3.5 sm:px-4 py-3.5 sm:py-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                disabled
                  ? "opacity-55 cursor-not-allowed bg-muted/30"
                  : selected
                    ? "bg-primary/[0.06]"
                    : "bg-transparent hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-0 bottom-0 w-1 transition-colors",
                  selected ? "bg-primary" : "bg-transparent",
                )}
                aria-hidden
              />

              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                  disabled
                    ? "bg-muted text-muted-foreground"
                    : selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground border border-border",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("font-medium text-sm sm:text-[15px]", selected && !disabled && "text-foreground")}>
                    {opt.title}
                  </span>
                  {opt.comingSoon ? (
                    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  ) : opt.benefit ? (
                    <span className="text-[11px] font-medium text-muted-foreground/90 tracking-wide">
                      · {opt.benefit}
                    </span>
                  ) : null}
                  {showProvider && opt.provider ? (
                    <span className="inline-flex items-center rounded border border-dashed border-amber-600/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                      {opt.provider}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs sm:text-[13px] leading-snug text-muted-foreground">
                  {opt.comingSoon
                    ? "This card option isn’t available yet — pick another method below."
                    : opt.description}
                </p>
              </div>

              <span
                className={cn(
                  "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                  disabled
                    ? "border-muted-foreground/20"
                    : selected
                      ? "border-primary"
                      : "border-muted-foreground/35",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-colors",
                    selected && !disabled ? "bg-primary" : "bg-transparent",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
