import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { KycStatusBadge, TierBadge } from "@/components/admin-portal/Badges";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const AdminDashboardPage = () => {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-dashboard", "stats"],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const [usersC, pendingC, approvedC, rejectedC, audit, tiers, kycList] = await Promise.all([
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
        supabase.from("kyc_verifications").select("id", { count: "exact", head: true }).eq("verification_status", "pending_review"),
        supabase.from("kyc_audit_log").select("id", { count: "exact", head: true }).eq("action", "approved").gte("created_at", todayStart.toISOString()),
        supabase.from("kyc_audit_log").select("id", { count: "exact", head: true }).eq("action", "rejected").gte("created_at", todayStart.toISOString()),
        supabase.from("kyc_audit_log").select("id, action, created_at, kyc_verification_id, admin_id, new_status, previous_status").order("created_at", { ascending: false }).limit(10),
        supabase.from("user_risk_tiers").select("current_tier"),
        supabase.from("kyc_verifications").select("id, user_id, submitted_at, verification_status").eq("verification_status", "pending_review").order("submitted_at", { ascending: true }).limit(5),
      ]);

      const tierCounts: Record<string, number> = { tier_1: 0, tier_2: 0, tier_3: 0 };
      (tiers.data || []).forEach((t) => { tierCounts[t.current_tier as string] = (tierCounts[t.current_tier as string] || 0) + 1; });

      // Approval/rejection rate (last 30 days)
      const thirty = new Date(); thirty.setDate(thirty.getDate() - 30);
      const { data: recent } = await supabase.from("kyc_audit_log").select("action, created_at").gte("created_at", thirty.toISOString()).in("action", ["approved", "rejected"]);
      const total = (recent || []).length;
      const approvedRate = total > 0 ? Math.round((((recent || []).filter((r) => r.action === "approved").length) / total) * 100) : 0;
      const rejectedRate = total > 0 ? 100 - approvedRate : 0;

      return {
        totalUsers: usersC.count || 0,
        pending: pendingC.count || 0,
        approvedToday: approvedC.count || 0,
        rejectedToday: rejectedC.count || 0,
        recentAudit: audit.data || [],
        tierCounts,
        urgent: kycList.data || [],
        approvedRate,
        rejectedRate,
      };
    },
    refetchInterval: 30000,
  });

  const Kpi = ({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number | string; accent: string }) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-display font-semibold">
            {statsLoading ? <Skeleton className="h-7 w-12" /> : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform overview and KYC oversight</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={Users} label="Total users" value={stats?.totalUsers ?? 0} accent="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
          <Kpi icon={Clock} label="Pending review" value={stats?.pending ?? 0} accent="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          <Kpi icon={CheckCircle2} label="Approved today" value={stats?.approvedToday ?? 0} accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <Kpi icon={XCircle} label="Rejected today" value={stats?.rejectedToday ?? 0} accent="bg-red-500/10 text-red-600 dark:text-red-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tier distribution */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">User distribution by tier</CardTitle>
              <CardDescription>Active risk tier assignments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stats?.tierCounts || {}).map(([tier, count]) => {
                const total = Object.values(stats?.tierCounts || {}).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={tier}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <TierBadge tier={tier} />
                      <span className="text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Approval rate (30d)</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats?.approvedRate ?? 0}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Rejection rate (30d)</span>
                <span className="font-semibold text-red-600 dark:text-red-400">{stats?.rejectedRate ?? 0}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Urgent reviews */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Urgent reviews</CardTitle>
                <CardDescription>Pending submissions, oldest first</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/kyc")}>View queue</Button>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : stats?.urgent.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">All caught up — no pending reviews.</div>
              ) : (
                <div className="divide-y">
                  {stats?.urgent.map((row) => {
                    const submitted = row.submitted_at ? new Date(row.submitted_at) : null;
                    const hoursOld = submitted ? Math.round((Date.now() - submitted.getTime()) / 36e5) : 0;
                    const overdue = hoursOld > 24;
                    return (
                      <button key={row.id} onClick={() => navigate(`/admin/kyc/${row.id}`)} className="w-full text-left flex items-center justify-between py-3 hover:bg-accent/30 px-2 rounded-md">
                        <div>
                          <div className="text-sm font-medium font-mono">{row.id.slice(0, 8)}</div>
                          <div className="text-xs text-muted-foreground">
                            {submitted ? formatDistanceToNow(submitted, { addSuffix: true }) : "Not yet submitted"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {overdue && <span className="text-xs text-red-600 dark:text-red-400 font-medium">Over 24h</span>}
                          <KycStatusBadge status={row.verification_status} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent admin activity</CardTitle>
            <CardDescription>Latest 10 audit log entries</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : stats?.recentAudit.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No activity yet.</div>
            ) : (
              <div className="divide-y">
                {stats?.recentAudit.map((entry) => (
                  <div key={entry.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium capitalize">{entry.action}</span>
                      {entry.previous_status && entry.new_status && (
                        <span className="text-muted-foreground text-xs">{entry.previous_status} → {entry.new_status}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => navigate(`/admin/kyc/${entry.kyc_verification_id}`)} className="text-xs font-mono text-primary hover:underline">
                        #{entry.kyc_verification_id.slice(0, 8)}
                      </button>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
