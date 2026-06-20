import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ArrowRight,
  Clock,
  AlertTriangle,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";
import {
  dismissKycPrompt,
  getKycPromptConfig,
  isKycPromptDismissed,
} from "@/lib/kycPrompt";
import { cn } from "@/lib/utils";

const variantStyles = {
  verify: {
    border: "border-primary/25",
    glow: "from-primary/[0.08] via-transparent to-[hsl(var(--accent-amber)/0.06)]",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    Icon: ShieldCheck,
  },
  continue: {
    border: "border-primary/25",
    glow: "from-primary/[0.08] via-transparent to-transparent",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    Icon: ShieldCheck,
  },
  upgrade: {
    border: "border-[hsl(var(--accent-amber)/0.35)]",
    glow: "from-[hsl(var(--accent-amber)/0.10)] via-transparent to-primary/[0.04]",
    iconBg: "bg-[hsl(var(--accent-amber)/0.15)]",
    iconColor: "text-[hsl(var(--accent-amber))]",
    Icon: Sparkles,
  },
  pending: {
    border: "border-amber-500/30",
    glow: "from-amber-500/[0.08] via-transparent to-transparent",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600",
    Icon: Clock,
  },
  rejected: {
    border: "border-destructive/30",
    glow: "from-destructive/[0.06] via-transparent to-transparent",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    Icon: AlertTriangle,
  },
} as const;

const KycPromptBanner = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { kyc, tier, isLoading } = useKyc();
  const { data: profile } = useProfile();
  const [dismissed, setDismissed] = useState(isKycPromptDismissed);

  const config = useMemo(
    () => getKycPromptConfig(profile, tier, kyc),
    [profile, tier, kyc],
  );

  if (isLoading || !config) return null;
  if (config.dismissible && dismissed) return null;

  const style = variantStyles[config.variant];
  const { Icon } = style;

  const handleDismiss = () => {
    dismissKycPrompt();
    setDismissed(true);
  };

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative mb-6 overflow-hidden rounded-2xl border bg-card shadow-sm",
        style.border,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          style.glow,
        )}
      />

      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            style.iconBg,
          )}
        >
          <Icon className={cn("h-6 w-6", style.iconColor)} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Account verification
          </p>
          <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {config.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{config.message}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {config.perks.map((perk) => (
              <li
                key={perk}
                className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
          <Button
            size="lg"
            className={cn(
              "gap-2 shadow-sm",
              config.variant === "upgrade" &&
                "bg-[hsl(var(--accent-amber))] text-white hover:bg-[hsl(var(--accent-amber)/0.9)]",
              config.variant === "pending" &&
                "bg-amber-500 text-white hover:bg-amber-500/90",
            )}
            onClick={() => navigate(config.href)}
          >
            {config.cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {config.dismissible ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleDismiss}
            >
              Remind me later
            </Button>
          ) : null}
        </div>

        {config.dismissible ? (
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </motion.section>
  );
};

export default KycPromptBanner;
