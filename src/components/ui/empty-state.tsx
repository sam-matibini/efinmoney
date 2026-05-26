import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Size preset. Default 'md'. */
  size?: "sm" | "md" | "lg";
}

/**
 * Unified empty-state component. Use everywhere a list/table/card has no data
 * instead of ad-hoc "No data" strings.
 */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) => {
  const pad =
    size === "sm" ? "py-8 px-4" : size === "lg" ? "py-20 px-6" : "py-12 px-6";
  const iconWrap =
    size === "sm" ? "w-10 h-10" : size === "lg" ? "w-16 h-16" : "w-14 h-14";
  const iconSize =
    size === "sm" ? "w-5 h-5" : size === "lg" ? "w-8 h-8" : "w-7 h-7";
  const titleSize =
    size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        pad,
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "rounded-2xl bg-muted/60 flex items-center justify-center mb-4 ring-1 ring-inset ring-border/60",
            iconWrap
          )}
        >
          <Icon className={cn("text-muted-foreground", iconSize)} strokeWidth={1.75} />
        </div>
      )}
      <h3 className={cn("font-display font-semibold text-foreground", titleSize)}>
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

export default EmptyState;
