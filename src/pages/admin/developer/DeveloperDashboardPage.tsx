import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Briefcase, AlertTriangle, ArrowRight, Code2, ListChecks } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";

// New types aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any; functions: any };

const DeveloperDashboardPage = () => {
  const { admin } = useAdminAuth();

  // Count onboarded users + businesses by this admin in the last 7 days
  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["developer-stats", admin?.id],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [usersRes, businessesRes, orphansRes] = await Promise.all([
        db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("onboarded_by_admin_id", admin!.id)
          .gte("onboarded_at", sevenDaysAgo),
        db
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("onboarded_by_admin_id", admin!.id)
          .gte("onboarded_at", sevenDaysAgo),
        db
          .from("admin_orphaned_invitations")
          .select("profile_id", { count: "exact", head: true }),
      ]);
      return {
        usersThisWeek: usersRes.count || 0,
        businessesThisWeek: businessesRes.count || 0,
        pendingClaims: orphansRes.count || 0,
      };
    },
    enabled: !!admin,
  });

  // Recent onboardings
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["developer-recent", admin?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, user_id, email, full_name, onboarded_at, kyc_tier, account_status")
        .eq("onboarded_by_admin_id", admin!.id)
        .order("onboarded_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        user_id: string;
        email: string | null;
        full_name: string | null;
        onboarded_at: string;
        kyc_tier: string;
        account_status: string;
      }>;
    },
    enabled: !!admin,
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <Code2 className="w-7 h-7 text-primary" /> Developer
          </h1>
          <p className="text-sm text-muted-foreground">
            Onboard users and businesses on their behalf. The customer always completes their own KYC.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Users onboarded this week</CardDescription>
              <CardTitle className="text-3xl">
                {countsLoading ? <Skeleton className="h-9 w-12" /> : counts?.usersThisWeek ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Businesses onboarded this week</CardDescription>
              <CardTitle className="text-3xl">
                {countsLoading ? <Skeleton className="h-9 w-12" /> : counts?.businessesThisWeek ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className={counts && counts.pendingClaims > 0 ? "border-amber-500/40" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                {counts && counts.pendingClaims > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                Pending claims (&gt;14 days)
              </CardDescription>
              <CardTitle className="text-3xl">
                {countsLoading ? <Skeleton className="h-9 w-12" /> : counts?.pendingClaims ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> Onboard a User
              </CardTitle>
              <CardDescription>
                Collect identity and address. Customer receives an invite email to set their password and complete KYC at tier 0.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/admin/developer/onboard-user">
                  Start <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" /> Onboard a Business
              </CardTitle>
              <CardDescription>
                Collect business details, owner info, and UBOs. UBOs must total exactly 100% ownership and voting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/admin/developer/onboard-business">
                  Start <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="w-5 h-5" /> Recent onboardings
              </CardTitle>
              <CardDescription>The 10 most recent users you onboarded.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/developer/onboarded">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !recent || recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nothing yet. Onboard a user to see them here.
              </p>
            ) : (
              <div className="divide-y">
                {recent.map((r) => (
                  <Link
                    key={r.id}
                    to={`/admin/users/${r.user_id}`}
                    className="flex items-center justify-between py-3 px-2 hover:bg-muted/40 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.full_name || r.email || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs text-muted-foreground">
                        {r.onboarded_at ? formatDistanceToNow(new Date(r.onboarded_at), { addSuffix: true }) : ""}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">{r.kyc_tier}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default DeveloperDashboardPage;
