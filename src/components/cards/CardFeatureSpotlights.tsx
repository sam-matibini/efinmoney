import { ArrowRight, CreditCard, Lock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpotlightProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}

const SpotlightCard = ({
  icon,
  title,
  description,
  actionLabel,
  onClick,
  disabled,
  disabledHint,
}: SpotlightProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative w-full text-left rounded-2xl border bg-card/80 backdrop-blur-sm p-5 transition-all duration-200",
      "hover:border-primary/40 hover:bg-card hover:shadow-[0_12px_40px_-16px_hsl(var(--primary)/0.35)] hover:-translate-y-0.5",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      "active:translate-y-0 active:scale-[0.99]",
      disabled && "opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:border-border",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div
        className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
          "bg-primary/15 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
        )}
      >
        {icon}
      </div>
      <span
        className={cn(
          "mt-1 flex items-center gap-1 text-xs font-medium text-primary opacity-0 -translate-x-1 transition-all",
          "group-hover:opacity-100 group-hover:translate-x-0",
          disabled && "group-hover:opacity-0",
        )}
      >
        {actionLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </div>
    <h4 className="font-semibold mt-4 mb-1">{title}</h4>
    <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    {disabled && disabledHint && (
      <p className="mt-2 text-xs text-muted-foreground/80">{disabledHint}</p>
    )}
  </button>
);

interface CardFeatureSpotlightsProps {
  hasIssuedCard: boolean;
  activeCardFrozen: boolean;
  onLock: () => void;
  onCreateVirtual: () => void;
  onSpendingLimits: () => void;
}

const CardFeatureSpotlights = ({
  hasIssuedCard,
  activeCardFrozen,
  onLock,
  onCreateVirtual,
  onSpendingLimits,
}: CardFeatureSpotlightsProps) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <SpotlightCard
      icon={<Lock className="w-5 h-5" />}
      title="Instant Lock"
      description="Lock your card instantly from the app if it's lost or stolen."
      actionLabel={activeCardFrozen ? "Unlock card" : "Lock card"}
      onClick={onLock}
      disabled={!hasIssuedCard}
      disabledHint="Issue a card above to use instant lock."
    />
    <SpotlightCard
      icon={<CreditCard className="w-5 h-5" />}
      title="Virtual Cards"
      description="Create unlimited virtual cards for secure online shopping."
      actionLabel="Create card"
      onClick={onCreateVirtual}
    />
    <SpotlightCard
      icon={<Settings className="w-5 h-5" />}
      title="Spending Limits"
      description="Set custom spending limits for better financial control."
      actionLabel="Edit limits"
      onClick={onSpendingLimits}
      disabled={!hasIssuedCard}
      disabledHint="Select an issued card above to set limits."
    />
  </div>
);

export default CardFeatureSpotlights;
