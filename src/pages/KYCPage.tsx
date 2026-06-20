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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  const statusConfig = {
    verified: { icon: CheckCircle2, color: 'text-primary', label: 'Verified' },
    approved: { icon: CheckCircle2, color: 'text-primary', label: 'Approved' },
    pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending Review' },
    rejected: { icon: AlertTriangle, color: 'text-destructive', label: 'Rejected' },
  } as const;

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = cfg.icon;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">KYC Verification</h1>
        <KycPromptBanner />
        {isLoading ? (
          <Card className="p-6">Loading...</Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-foreground">Verification Status</h2>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your account is currently <span className="font-medium text-foreground">{cfg.label}</span>
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">Status: {cfg.label}</Badge>
                    <Badge variant="outline">{tier.replace('_', ' ').toUpperCase()}</Badge>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-1">Tier Limits & Features</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your current tier is highlighted. Unlock higher tiers by completing the matching verification step.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Single</TableHead>
                      <TableHead className="text-right">Daily</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="text-right">Max Balance</TableHead>
                      <TableHead>Features</TableHead>
                      <TableHead className="text-right">Access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tierLimits ?? []).map((t: any) => {
                      const tKey = t.tier as TierKey;
                      const isCurrent = tKey === currentTier;
                      const isUnlocked = TIER_ORDER[tKey] <= TIER_ORDER[currentTier];
                      const isLocked = !isUnlocked;
                      const upgradePath =
                        tKey === "tier_2"
                          ? "/onboarding/identity?autostart=persona"
                          : tKey === "tier_3"
                          ? "/onboarding/enhanced"
                          : null;
                      return (
                        <TableRow key={t.tier} className={isCurrent ? "bg-primary/5" : isLocked ? "opacity-70" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={isCurrent ? "default" : "outline"} className="uppercase">
                                {String(t.tier).replace("_", " ")}
                              </Badge>
                              {isCurrent && <span className="text-xs text-primary font-medium">Current</span>}
                              {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{t.label}</div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(t.single_limit)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(t.daily_limit)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(t.monthly_limit)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(t.max_balance)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              {FEATURE_KEYS.map((f) => {
                                const on = Boolean(t.features_enabled?.[f]);
                                return (
                                  <span
                                    key={f}
                                    className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${
                                      on
                                        ? "border-primary/30 bg-primary/10 text-foreground"
                                        : "border-border bg-muted/30 text-muted-foreground line-through"
                                    }`}
                                  >
                                    {on ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {f.replace("_", " ")}
                                  </span>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              if (isUnlocked) {
                                return (
                                  <Badge variant="secondary" className="gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Verified
                                  </Badge>
                                );
                              }
                              const canUpgrade =
                                upgradePath && TIER_ORDER[tKey] === TIER_ORDER[currentTier] + 1;

                              const targetsThisTier =
                                (kyc as any)?.tier_target == null ||
                                (kyc as any)?.tier_target === tKey;
                              const isPending =
                                canUpgrade &&
                                targetsThisTier &&
                                kyc?.verification_status === "pending_review";
                              const isRejected =
                                canUpgrade &&
                                targetsThisTier &&
                                kyc?.verification_status === "rejected";

                              if (isPending) {
                                return (
                                  <div className="inline-flex flex-col items-end gap-1">
                                    <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                                      <Clock className="w-3 h-3" /> Submitted — under review
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      We'll get back within 24 hrs
                                    </span>
                                  </div>
                                );
                              }
                              if (isRejected) {
                                return (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => navigate(upgradePath!)}
                                    className="gap-1"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" /> Rejected — Reapply
                                  </Button>
                                );
                              }
                              return (
                                <Button
                                  size="sm"
                                  variant={canUpgrade ? "outline" : "ghost"}
                                  onClick={() => {
                                    if (canUpgrade) {
                                      navigate(upgradePath!);
                                    } else {
                                      toast.error("Tier locked", {
                                        description:
                                          tKey === "tier_3"
                                            ? "You must be verified at Tier 2 before upgrading to Tier 3."
                                            : "Complete the previous tier first.",
                                      });
                                    }
                                  }}
                                  className="gap-1"
                                >
                                  {canUpgrade ? (
                                    <>
                                      <Upload className="w-3.5 h-3.5" />
                                      Upgrade
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3.5 h-3.5" />
                                      Locked
                                    </>
                                  )}
                                </Button>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>

          </div>
        )}
    </div>
  );
};

export default KYCPage;
