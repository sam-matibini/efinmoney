import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { Shield, Upload, CheckCircle2, AlertTriangle, Clock, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TierKey = "tier_1" | "tier_2" | "tier_3";
const VISIBLE_TIERS: TierKey[] = ["tier_1", "tier_2", "tier_3"];
const FEATURE_KEYS = ["receive", "send", "topup", "bills", "international", "virtual_card", "business"] as const;

const KYCPage = () => {
  const { data: profile, isLoading } = useProfile();
  const { tier: userTier } = useKyc();
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
    verified: { icon: CheckCircle2, color: 'text-green-500', label: 'Verified' },
    approved: { icon: CheckCircle2, color: 'text-green-500', label: 'Approved' },
    pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending Review' },
    rejected: { icon: AlertTriangle, color: 'text-destructive', label: 'Rejected' },
  } as const;

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">KYC Verification</h1>
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

            {!isVerified && (
              <Card className="p-6">
                <h3 className="font-semibold text-foreground mb-2">Complete Your Verification</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your government-issued ID and proof of address to unlock higher transaction limits.
                </p>
                <Button onClick={() => navigate("/onboarding/identity?autostart=persona")}>
                  <Upload className="w-4 h-4 mr-2" />
                  Start ID Verification
                </Button>

              </Card>
            )}

            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-1">Tier Limits & Features</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your current tier is highlighted. Limits and feature access are managed by your admin and update in real time.
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tierLimits ?? []).map((t: any) => {
                      const isCurrent = t.tier === currentTier;
                      return (
                        <TableRow key={t.tier} className={isCurrent ? "bg-primary/5" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={isCurrent ? "default" : "outline"} className="uppercase">
                                {String(t.tier).replace("_", " ")}
                              </Badge>
                              {isCurrent && <span className="text-xs text-primary font-medium">Current</span>}
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
    </div>
  );
};

export default KYCPage;
