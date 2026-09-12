import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowRight, Clock, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKyb, KybStep } from "@/hooks/useKyb";
import { useAuth } from "@/hooks/useAuth";
import { isBusinessPrimaryAccount } from "@/lib/kybOnboarding";
import { cn } from "@/lib/utils";

// Only the "register" state is dismissible — a user with no business may never
// want one, but once an application exists they should always see where it is.
const DISMISS_KEY = "efin_kyb_prompt_dismissed_at";
const DISMISS_DAYS = 30;

const isDismissed = () => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const dismiss = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — banner simply reappears next load */
  }
};

// Resume where they stopped rather than restarting the wizard.
const stepPath: Record<KybStep, string> = {
  details: "/onboarding/business/details",
  ownership: "/onboarding/business/ownership",
  documents: "/onboarding/business/documents",
  review: "/onboarding/business/review",
  completed: "/onboarding/business/details",
};

const variants = {
  register: {
    border: "border-primary/25",
    glow: "from-primary/[0.08] via-transparent to-transparent",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    Icon: Building2,
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
  active: {
    border: "border-primary/25",
    glow: "from-primary/[0.08] via-transparent to-transparent",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    Icon: CheckCircle2,
  },
} as const;

const BusinessPromptCard = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { business, isLoading } = useKyb();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(isDismissed);
  const businessPrimary = isBusinessPrimaryAccount(user, business);

  if (isLoading) return null;

  let variant: keyof typeof variants = "register";
  let eyebrow = "Business account";
  let title = "Onboard your business";
  let message =
    "Open a business account for your company. Verification takes 1–2 business days.";
  let cta = "Register a business";
  let href = "/onboarding/business/details";
  let dismissible = !businessPrimary;
  let perks = ["Higher limits", "Business payouts", "Multi-currency"];

  if (businessPrimary && !business) {
    title = "Verify your business";
    message =
      "Company accounts use KYB — a staff document review — not personal KYC (Persona or Interac).";
    cta = "Start KYB";
    perks = ["Company details", "Ownership", "Documents"];
  }

  if (business) {
    dismissible = false;

    if (business.kyb_status === "approved") {
      variant = "active";
      eyebrow = "Business account";
      title = `${business.legal_name} is verified`;
      message = "Your business account is active. View limits and manage payouts.";
      cta = "Open business account";
      href = "/business";
      perks = [];
    } else if (business.kyb_status === "pending_review") {
      variant = "pending";
      title = "Verification in review";
      message = `We're reviewing ${business.legal_name}. We'll email you as soon as there's a decision.`;
      cta = "View status";
      href = "/onboarding/business/submitted";
      perks = ["Usually 1–2 business days"];
    } else if (business.kyb_status === "rejected" || business.kyb_status === "suspended") {
      variant = "rejected";
      title =
        business.kyb_status === "suspended"
          ? "Business account suspended"
          : "Action needed on your application";
      message =
        business.rejection_reason ||
        "We couldn't verify your business. Review the details and resubmit.";
      cta = business.kyb_status === "suspended" ? "Contact support" : "Update and resubmit";
      href = "/onboarding/business/rejected";
      perks = [];
    } else {
      // not_started / in_progress — resume the wizard
      title = `Finish setting up ${business.legal_name || "your business"}`;
      message = "Your application is saved. Pick up where you left off.";
      cta = "Continue application";
      href = stepPath[business.current_step] ?? "/onboarding/business/details";
      perks = ["Higher limits", "Business payouts"];
    }
  }

  if (dismissible && dismissed) return null;

  const style = variants[variant];
  const { Icon } = style;

  const handleDismiss = () => {
    dismiss();
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
            {eyebrow}
          </p>
          <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {perks.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {perks.map((perk) => (
                <li
                  key={perk}
                  className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground"
                >
                  {perk}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
          <Button
            size="lg"
            className={cn(
              "gap-2 shadow-sm",
              variant === "pending" && "bg-amber-500 text-white hover:bg-amber-500/90",
            )}
            onClick={() => navigate(href)}
          >
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {dismissible && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleDismiss}
            >
              Not now
            </Button>
          )}
        </div>

        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.section>
  );
};

export default BusinessPromptCard;
