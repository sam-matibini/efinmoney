import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PageHeroVariant =
  | "primary"
  | "accent"
  | "hero"
  | "cta"
  | "emerald"
  | "sky"
  | "rose";

export interface PageHeroMeta {
  icon?: LucideIcon;
  text: string;
}

export interface PageHeroBannerProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  meta?: PageHeroMeta[];
  variant?: PageHeroVariant;
  hint?: React.ReactNode;
  className?: string;
}

const variantClass: Record<PageHeroVariant, string> = {
  primary: "gradient-primary",
  accent: "gradient-accent",
  hero: "gradient-hero",
  cta: "gradient-cta",
  emerald: "gradient-banner-emerald",
  sky: "gradient-banner-sky",
  rose: "gradient-banner-rose",
};

const toneClass: Record<PageHeroVariant, "light" | "dark"> = {
  primary: "light",
  accent: "light",
  hero: "light",
  cta: "dark",
  emerald: "light",
  sky: "light",
  rose: "light",
};

export default function PageHeroBanner({
  icon: Icon,
  label,
  value,
  meta = [],
  variant = "primary",
  hint,
  className,
}: PageHeroBannerProps) {
  const tone = toneClass[variant];
  const labelClass = tone === "light" ? "text-primary-foreground/70" : "text-[hsl(var(--brand-900)/0.65)]";
  const valueClass = tone === "light" ? "text-primary-foreground" : "text-[hsl(var(--brand-900))]";
  const metaClass = tone === "light" ? "text-primary-foreground/70" : "text-[hsl(var(--brand-900)/0.6)]";
  const metaMutedClass = tone === "light" ? "text-primary-foreground/60" : "text-[hsl(var(--brand-900)/0.5)]";

  return (
    <Card className={cn(variantClass[variant], "border-0 shadow-lg text-primary-foreground", className)}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-2">
          <Icon className={cn("w-6 h-6 shrink-0", valueClass)} />
          <span className={cn("text-sm font-medium", labelClass)}>{label}</span>
          {hint}
        </div>
        <div className={cn("text-3xl sm:text-4xl font-display font-bold leading-tight", valueClass)}>
          {value}
        </div>
        {meta.length > 0 && (
          <div className="mt-3 space-y-1">
            {meta.map((item, i) => {
              const MetaIcon = item.icon;
              return (
                <div
                  key={`${item.text}-${i}`}
                  className={cn("flex items-center gap-2 text-sm", i === 0 ? metaClass : metaMutedClass)}
                >
                  {MetaIcon ? <MetaIcon className="w-4 h-4 shrink-0" /> : null}
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
