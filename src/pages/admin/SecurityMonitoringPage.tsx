import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, KeyRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function SecurityMonitoringPage() {
  // Aggregate counts for the 4 KPI cards. Read directly from audit_logs
  // grouped by action (one round trip per card, no view needed) so the
  // counts never get blocked by the security_events_view RLS quirks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const fetchCount = async (action: string): Promise<number> => {
    const { count, error } = await db
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", action);
    if (error) {
      console.warn(`[SecurityMonitoring] count(${action}) failed:`, error);
      return 0;
    }
    return count ?? 0;
  };

  const { data: failedLogins = 0 } = useQuery({
    queryKey: ["security-count", "LOGIN_FAILED"],
    queryFn: () => fetchCount("LOGIN_FAILED"),
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const { data: privilegeChanges = 0 } = useQuery({
    queryKey: ["security-count", "PRIVILEGE_CHANGE"],
    queryFn: () => fetchCount("PRIVILEGE_CHANGE"),
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const { data: dataExports = 0 } = useQuery({
    queryKey: ["security-count", "DATA_EXPORT"],
    queryFn: () => fetchCount("DATA_EXPORT"),
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const { data: suspiciousAccess = 0 } = useQuery({
    queryKey: ["security-count", "SUSPICIOUS_ACCESS"],
    queryFn: () => fetchCount("SUSPICIOUS_ACCESS"),
    refetchInterval: 10_000,
    staleTime: 0,
  });

  const { data: incidents = [], isLoading: incLoading } = useQuery({
    queryKey: ["security-incidents"],
    queryFn: async () => {
      const { data } = await db.from("security_incidents").select("*").order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
    refetchInterval: 10_000,
    staleTime: 0,
  });

  // Most recent failed login attempts (any audience) — gives the security
  // team visibility into individual attempts, not just the aggregate count.
  const { data: recentFailedLogins = [], isLoading: recentLoading } = useQuery({
    queryKey: ["security-recent-failed-logins"],
    queryFn: async () => {
      const { data } = await db
        .from("audit_logs")
        .select("id, created_at, new_data")
        .eq("action", "LOGIN_FAILED")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    refetchInterval: 10_000,
    staleTime: 0,
  });

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Monitoring</h1>
        <p className="text-muted-foreground">Failed logins, privilege escalations, data exports, and suspicious activity</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-red-500">{failedLogins}</div><div className="text-xs text-center text-muted-foreground">Failed Logins</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-amber-500">{privilegeChanges}</div><div className="text-xs text-center text-muted-foreground">Privilege Changes</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-blue-500">{dataExports}</div><div className="text-xs text-center text-muted-foreground">Data Exports</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-purple-500">{suspiciousAccess}</div><div className="text-xs text-center text-muted-foreground">Suspicious Access</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" />Security Incidents</CardTitle></CardHeader>
        <CardContent>
          {incLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {incidents.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No security incidents</TableCell></TableRow> : incidents.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.event_type}</TableCell>
                    <TableCell><Badge className={i.severity === "critical" ? "bg-red-500/10 text-red-600" : i.severity === "high" ? "bg-orange-500/10 text-orange-600" : "bg-muted"}>{i.severity}</Badge></TableCell>
                    <TableCell className="max-w-72 truncate">{i.description}</TableCell>
                    <TableCell><Badge className={i.resolved ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>{i.resolved ? "Resolved" : "Open"}</Badge></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(i.created_at), "MMM d, h:mm a")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" />Recent Failed Logins</CardTitle></CardHeader>
        <CardContent>
          {recentLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Audience</TableHead><TableHead className="text-right">When</TableHead></TableRow></TableHeader>
              <TableBody>
                {recentFailedLogins.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No failed login attempts</TableCell></TableRow> : recentFailedLogins.map((r: { id: string; created_at: string; new_data?: { kind?: string; email?: string } }) => {
                  const nd = r.new_data || {};
                  const kind = nd.kind ?? "admin";
                  const email = nd.email ?? "(unknown)";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{email}</TableCell>
                      <TableCell><Badge className={kind === "customer" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}>{kind}</Badge></TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, h:mm a")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}