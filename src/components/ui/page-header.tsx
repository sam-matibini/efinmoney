import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * Unified page header. Pairs h1 + description + optional icon and right-side actions.
 * Use at the top of every page/panel to keep typography consistent.
 */
export const PageHeader = ({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) => (
  <div className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
    <div className="min-w-0">
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
        {Icon && <Icon className="w-7 h-7 text-primary shrink-0" strokeWidth={2} />}
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
