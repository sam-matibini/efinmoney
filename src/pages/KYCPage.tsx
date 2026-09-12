import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import KycPromptBanner from "@/components/kyc/KycPromptBanner";
import { Shield, Upload, CheckCircle2, AlertTriangle, Clock, Check, X, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import { cn } from "@/lib/utils";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";

type TierKey = "tier_1" | "tier_2" | "tier_3";
const VISIBLE_TIERS: TierKey[] = ["tier_1", "tier_2", "tier_3"];
const TIER_ORDER: Record<TierKey, number> = { tier_1: 1, tier_2: 2, tier_3: 3 };
const FEATURE_KEYS = ["receive", "send", "topup", "bills", "international", "virtual_card", "business"] as const;

const KYCPage = () => {
  const { data: profile, isLoading } = useProfile();
  const { tier: userTier, kyc } = useKyc();
  const navigate = useNavigate();

  const { data: tierLimits } = useQuery({
    queryKey: ["kyc-tier-limits-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tier_limits")
        .select("*")
        .in("tier", VISIBLE_TIERS)
        .order("tier");
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentTier = (userTier?.current_tier as TierKey) || "tier_1";
  const fmt = (n: number) => `$${Number(n || 0).toLocaleString()}`;


  const status = profile?.kyc_status || 'pending';
  const tier = currentTier;

  const isVerified = status === 'verified' || status === 'approved';
  const isPending = status === 'pending' || status === 'submitted';

  const statusConfig = {
    verified: { icon: CheckCircle2, color: 'text-primary', label: 'Verified' },
    approved: { icon: CheckCircle2, color: 'text-primary', label: 'Approved' },
    pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending Review' },
    submitted: { icon: Clock, color: 'text-yellow-500', label: 'Waiting for compliance review' },
    rejected: { icon: AlertTriangle, color: 'text-destructive', label: 'Rejected' },
  } as const;

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = cfg.icon;

  return (
    <AppPage width="default" className="py-8" innerClassName="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">KYC Verification</h1>

        <PageHeroBanner
          icon={Shield}
          label="Verification status"
          value={cfg.label}
          meta={[
            { icon: Icon, text: `Current tier: ${tier.replace("_", " ").toUpperCase()}` },
            { icon: Lock, text: isVerified ? "Full send & receive unlocked" : "Complete verification to raise limits" },
          ]}
          variant="cta"
        />

        <KycPromptBanner />
        {isLoading ? (
          <Card className="p-6">Loading...</Card>
        ) : (
          <div className="space-y-4">
            <Card
              className={cn(
                "relative overflow-hidden p-6 border",
                isVerified
                  ? "border-primary/30"
                  : isPending
                  ? "border-amber-500/30"
                  : status === "rejected"
                  ? "border-destructive/30"
                  : "border-border",
              )}
            >
              <div
                className={cn(
                  "absolute inset-x-0 top-0 h-1",
                  isVerified
                    ? "bg-primary"
                    : isPending
                    ? "bg-amber-500"
                    : status === "rejected"
                    ? "bg-destructive"
                    : "bg-secondary",
                )}
              />
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                    isVerified
                      ? "bg-primary/10 text-primary"
                      : isPending
                      ? "bg-amber-500/10 text-amber-500"
                      : status === "rejected"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-foreground",
                  )}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-foreground">Verification Status</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Your account is currently{" "}
                    <span className="font-medium text-foreground">{cfg.label}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                        isVerified
                          ? "bg-primary/10 text-primary"
                          : isPending
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : status === "rejected"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {cfg.label}
                    </span>
                    <Badge variant="outline">{tier.replace("_", " ").toUpperCase()}</Badge>
                  </div>
                </div>
              </div>
            </Card>

            <div>
              <h3 className="font-semibold text-foreground mb-1">Tier Limits & Features</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your current tier is highlighted. Unlock higher tiers by completing the matching verification step.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {(tierLimits ?? []).map((t: any) => {
                  const tKey = t.tier as TierKey;
                  const tierNum = TIER_ORDER[tKey];
                  const isCurrent = tKey === currentTier;
                  const isUnlocked = TIER_ORDER[tKey] <= TIER_ORDER[currentTier];
                  const isLocked = !isUnlocked;
                  const upgradePath =
                    tKey === "tier_2"
                      ? "/onboarding/identity"
                      : tKey === "tier_3"
                      ? "/onboarding/enhanced"
                      : null;
                  const canUpgrade =
                    upgradePath && TIER_ORDER[tKey] === TIER_ORDER[currentTier] + 1;
                  const targetsThisTier =
                    (kyc as any)?.tier_target == null ||
                    (kyc as any)?.tier_target === tKey;
                  const isPending =
                    canUpgrade && targetsThisTier && kyc?.verification_status === "pending_review";
                  const isRejected =
                    canUpgrade && targetsThisTier && kyc?.verification_status === "rejected";

                  const limits = [
                    { label: "Single", value: t.single_limit },
                    { label: "Daily", value: t.daily_limit },
                    { label: "Monthly", value: t.monthly_limit },
                    { label: "Max balance", value: t.max_balance },
                  ];

                  return (
                    <div
                      key={t.tier}
                      className={cn(
                        "relative flex flex-col rounded-2xl border p-5 transition-shadow",
                        isCurrent
                          ? "border-primary/40 bg-gradient-to-br from-primary/[0.09] via-card to-card ring-1 ring-primary/20 shadow-sm"
                          : isLocked
                          ? "border-border bg-card/60"
                          : "border-border bg-card hover:shadow-sm",
                      )}
                    >
                      {isCurrent && (
                        <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Current
                        </span>
                      )}

                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black",
                            isCurrent
                              ? "bg-primary text-primary-foreground"
                              : isLocked
                              ? "bg-muted text-muted-foreground"
                              : "bg-secondary text-foreground",
                          )}
                        >
                          {tierNum}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-foreground">
                            Tier {tierNum}
                            {isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{t.label}</div>
                        </div>
                      </div>

                      {/* Limits */}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {limits.map((l) => (
                          <div key={l.label} className="rounded-xl bg-muted/40 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">{l.label}</div>
                            <div className="text-sm font-semibold text-foreground">{fmt(l.value)}</div>
                          </div>
                        ))}
                      </div>

                      {/* Features */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {FEATURE_KEYS.map((f) => {
                          const on = Boolean(t.features_enabled?.[f]);
                          return (
                            <span
                              key={f}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                                on
                                  ? "border-primary/30 bg-primary/10 text-foreground"
                                  : "border-border bg-muted/30 text-muted-foreground line-through",
                              )}
                            >
                              {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              {f.replace("_", " ")}
                            </span>
                          );
                        })}
                      </div>

                      {/* Access / CTA */}
                      <div className="mt-5 pt-1">
                        {isUnlocked ? (
                          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-sm font-medium text-primary">
                            <CheckCircle2 className="h-4 w-4" /> Verified
                          </div>
                        ) : isPending ? (
                          <div className="flex flex-col items-center gap-1 rounded-xl bg-amber-500/10 py-2 text-center">
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                              <Clock className="h-4 w-4" /> Submitted — under review
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {kyc?.verification_provider === "manual"
                                ? "Typical review is 1–2 business days"
                                : "We'll get back within 24 hrs"}
                            </span>
                          </div>
                        ) : isRejected ? (
                          <Button
                            variant="destructive"
                            onClick={() => navigate(upgradePath!)}
                            className="w-full gap-1.5"
                          >
                            <AlertTriangle className="h-4 w-4" /> Rejected — Reapply
                          </Button>
                        ) : canUpgrade ? (
                          <Button onClick={() => navigate(upgradePath!)} className="w-full gap-1.5">
                            <Upload className="h-4 w-4" /> Upgrade
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() =>
                              toast.error("Tier locked", {
                                description:
                                  tKey === "tier_3"
                                    ? "You must be verified at Tier 2 before upgrading to Tier 3."
                                    : "Complete the previous tier first.",
                              })
                            }
                            className="w-full gap-1.5 text-muted-foreground"
                          >
                            <Lock className="h-4 w-4" /> Locked
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
    </AppPage>
  );
};

export default KYCPage;
