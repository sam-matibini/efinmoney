import { cn } from "@/lib/utils";
import { tagMeta, type RiskSeverity } from "@/lib/personaTags";
import { ShieldAlert, AlertTriangle, Info } from "lucide-react";

const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

const ICONS: Record<RiskSeverity, typeof ShieldAlert> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

interface Props {
  tag: string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export const KycRiskTagChip = ({ tag, size = "sm", showIcon = true }: Props) => {
  const meta = tagMeta(tag);
  const Icon = ICONS[meta.severity];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        SEVERITY_CLASS[meta.severity],
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      )}
    >
      {showIcon && <Icon className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />}
      {meta.label}
    </span>
  );
};

export default KycRiskTagChip;
