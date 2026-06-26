import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Lock, Download, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function SecurityMonitoringPage() {
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["security-events"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data } = await db.from("security_events_view").select("*");
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: incidents = [], isLoading: incLoading } = useQuery({
    queryKey: ["security-incidents"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("security_incidents").select("*").order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: auditSummary } = useQuery({
    queryKey: ["audit-summary"],
    queryFn: async () => {
      const { count: failedLogins } = await supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "LOGIN_FAILED");
      return { failedLogins: failedLogins || 0 };
    },
  });

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Monitoring</h1>
        <p className="text-muted-foreground">Failed logins, privilege escalations, data exports, and suspicious activity</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-red-500">{auditSummary?.failedLogins ?? 0}</div><div className="text-xs text-center text-muted-foreground">Failed Logins</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-amber-500">{((events as any[])?.find((e: any) => e.event_type === "privilege_escalation_attempt")?.event_count) ?? 0}</div><div className="text-xs text-center text-muted-foreground">Privilege Changes</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-blue-500">{((events as any[])?.find((e: any) => e.event_type === "data_export")?.event_count) ?? 0}</div><div className="text-xs text-center text-muted-foreground">Data Exports</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-center text-purple-500">{((events as any[])?.find((e: any) => e.event_type === "suspicious_access")?.event_count) ?? 0}</div><div className="text-xs text-center text-muted-foreground">Suspicious Access</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" />Security Incidents</CardTitle></CardHeader>
        <CardContent>
          {incLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {incidents.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No security incidents</TableCell></TableRow> : incidents.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.event_type}</TableCell>
                    <TableCell><Badge className={i.severity === "critical" ? "bg-red-500/10 text-red-600" : i.severity === "high" ? "bg-orange-500/10 text-orange-600" : "bg-muted"}>{i.severity}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate">{i.description}</TableCell>
                    <TableCell><Badge className={i.resolved ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>{i.resolved ? "Resolved" : "Open"}</Badge></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(i.created_at), "MMM d, h:mm a")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}