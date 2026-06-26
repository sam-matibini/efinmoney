import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { open: "bg-red-500/10 text-red-600", reviewed: "bg-blue-500/10 text-blue-600", escalated: "bg-orange-500/10 text-orange-600", closed: "bg-emerald-500/10 text-emerald-600", false_positive: "bg-muted" };
  return <Badge className={m[s] || ""}>{s.replace(/_/g, " ")}</Badge>;
};

export default function TransactionMonitoringPage() {
  const qc = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["tx-monitoring-alerts"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("tx_monitoring_alerts").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("tx_monitoring_alerts").update({
        status, resolved_at: ["closed", "false_positive"].includes(status) ? new Date().toISOString() : null,
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tx-monitoring-alerts"] }); toast.success("Updated"); },
  });

  const open = alerts.filter((a: any) => a.status === "open").length;
  const escalated = alerts.filter((a: any) => a.status === "escalated").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Transaction Monitoring</h1><p className="text-muted-foreground">Velocity, threshold, structuring, and geography-based AML alerts</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{alerts.length}</div><div className="text-xs text-muted-foreground">Total alerts</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{open}</div><div className="text-xs text-muted-foreground">Open</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-orange-500">{escalated}</div><div className="text-xs text-muted-foreground">Escalated</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="w-5 h-5" />Monitoring Alerts</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Risk Score</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {alerts.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No alerts triggered.</TableCell></TableRow> : alerts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.rule_name}</TableCell>
                    <TableCell className="capitalize">{a.alert_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono">{a.amount ? `${a.currency_code} ${Number(a.amount).toLocaleString()}` : "—"}</TableCell>
                    <TableCell><Badge className={a.risk_score >= 70 ? "bg-red-500/10 text-red-600" : a.risk_score >= 40 ? "bg-amber-500/10 text-amber-600" : "bg-muted"}>{a.risk_score}</Badge></TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, h:mm a")}</TableCell>
                    <TableCell className="text-right">
                      {a.status === "open" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: a.id, status: "escalated" })}>Escalate</Button>
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: a.id, status: "false_positive" })}>FP</Button>
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: a.id, status: "closed" })}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                      {a.status === "escalated" && <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: a.id, status: "closed" })}>Close</Button>}
                    </TableCell>
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
