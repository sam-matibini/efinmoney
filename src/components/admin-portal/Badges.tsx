import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  pending_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  expired: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export const KycStatusBadge = ({ status }: { status: string | null | undefined }) => {
  const key = status || "not_started";
  return (
    <Badge variant="outline" className={cn("font-medium border", STYLES[key] || STYLES.not_started)}>
      {LABELS[key] || key}
    </Badge>
  );
};

const TIER_STYLES: Record<string, string> = {
  tier_1: "bg-muted text-muted-foreground border-border",
  tier_2: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  tier_3: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

export const TierBadge = ({ tier }: { tier: string | null | undefined }) => {
  const key = tier || "tier_1";
  const label = key.replace("tier_", "Tier ");
  return (
    <Badge variant="outline" className={cn("font-medium border", TIER_STYLES[key] || TIER_STYLES.tier_1)}>
      {label}
    </Badge>
  );
};

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  compliance_officer: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  support_agent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  viewer: "bg-muted text-muted-foreground border-border",
};

export const RoleBadge = ({ role }: { role: string }) => (
  <Badge variant="outline" className={cn("font-medium border capitalize", ROLE_STYLES[role] || ROLE_STYLES.viewer)}>
    {role.replace("_", " ")}
  </Badge>
);
