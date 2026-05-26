import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

const tierMeta: Record<string, { label: string; color: string; icon: any }> = {
  tier_1: { label: "Tier 1 · Basic", color: "bg-muted text-muted-foreground", icon: Shield },
  tier_2: { label: "Tier 2 · Verified", color: "bg-blue-500/10 text-blue-500", icon: ShieldCheck },
  tier_3: { label: "Tier 3 · Enhanced", color: "bg-green-500/10 text-green-500", icon: ShieldAlert },
};

interface RiskTierRow {
  user_id: string;
  current_tier: string;
  daily_transaction_limit: number;
  monthly_transaction_limit: number;
  single_transaction_limit: number;
  upgraded_at: string | null;
  updated_at: string;
}

export const RiskTiersPanel = () => {
  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["admin-risk-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_risk_tiers")
        .select("user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, upgraded_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as RiskTierRow[];
    },
  });

  const userIds = useMemo(() => tiers.map(t => t.user_id), [tiers]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-risk-tier-profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string | null }>();
    profiles.forEach((p: any) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const distribution = useMemo(() => {
    const counts: Record<string, number> = { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 };
    tiers.forEach(t => { counts[t.current_tier] = (counts[t.current_tier] || 0) + 1; });
    const total = tiers.length || 1;
    return Object.entries(counts).map(([tier, count]) => ({
      tier,
      count,
      pct: Math.round((count / total) * 100),
    }));
  }, [tiers]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Risk Tiers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {distribution.map(({ tier, count, pct }) => {
          const meta = tierMeta[tier] || tierMeta.tier_1;
          const Icon = meta.icon;
          return (
            <Card key={tier}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground">{count}</div>
                <Progress value={pct} className="h-1.5" />
                <p className="text-xs text-muted-foreground">{pct}% of users</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Risk Tier Assignments ({tiers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Single Limit</TableHead>
                  <TableHead className="text-right">Daily Limit</TableHead>
                  <TableHead className="text-right">Monthly Limit</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No risk tier assignments found
                    </TableCell>
                  </TableRow>
                ) : tiers.map(t => {
                  const meta = tierMeta[t.current_tier] || tierMeta.tier_1;
                  const p = profileMap.get(t.user_id);
                  return (
                    <TableRow key={t.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{p?.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{p?.email || t.user_id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={meta.color}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${Number(t.single_transaction_limit).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${Number(t.daily_transaction_limit).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${Number(t.monthly_transaction_limit).toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(t.updated_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
