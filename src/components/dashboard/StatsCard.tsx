import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  /** CSS colour for the top border and icon (use a --color-accent-* token). */
  accent: string;
  icon: LucideIcon;
  value: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Dashboard stat card: navy surface, 3px accent top border, icon top-right, scale on hover. */
export default function StatsCard({ title, accent, icon: Icon, value, subtitle, action, className }: StatsCardProps) {
  return (
    <section
      className={cn(
        "relative flex flex-col gap-2 rounded-[var(--radius-lg)] p-5 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-in-out hover:scale-[1.02] motion-reduce:hover:scale-100",
        className,
      )}
      style={{ borderTop: `3px solid ${accent}` }}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[var(--font-size-sm)] font-medium text-[var(--color-text-muted)]">{title}</h3>
        <Icon size={24} style={{ color: accent }} className="shrink-0 opacity-80" aria-hidden />
      </div>
      <div className="text-[var(--font-size-xl)] font-extrabold leading-tight text-[var(--color-text-primary)] tabular-nums">
        {value}
      </div>
      {subtitle && <div className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">{subtitle}</div>}
      {action && <div className="mt-auto pt-1">{action}</div>}
    </section>
  );
}
