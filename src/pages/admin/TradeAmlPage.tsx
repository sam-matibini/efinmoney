import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function TradeAmlPage() {
  const qc = useQueryClient();

  const { data: rules = [], isLoading: rLoading } = useQuery({
    queryKey: ["trade-aml-rules"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("trade_aml_rules").select("*").order("is_active", { ascending: false });
      return data || [];
    },
  });

  const { data: alerts = [], isLoading: aLoading } = useQuery({
    queryKey: ["trade-aml-alerts"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("trade_aml_alerts").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("trade_aml_rules").update({ is_active }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-aml-rules"] }),
  });

  const closeAlert = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("trade_aml_alerts").update({ status: "closed", resolved_at: new Date().toISOString(), reviewed_by: (await supabase.auth.getUser()).data.user?.id }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade-aml-alerts"] }); toast.success("Alert closed"); },
  });

  const openAlerts = alerts.filter((a: any) => a.status === "open").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Trade-Based AML Detection</h1><p className="text-muted-foreground">FX, crypto, and wire trade anomaly detection — rules and triggered alerts</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{rules.filter((r: any) => r.is_active).length}</div><div className="text-xs text-muted-foreground">Active rules</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{openAlerts}</div><div className="text-xs text-muted-foreground">Open alerts</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{alerts.length}</div><div className="text-xs text-muted-foreground">Total alerts</div></CardContent></Card>
      </div>

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList><TabsTrigger value="alerts">Alerts</TabsTrigger><TabsTrigger value="rules">Rules</TabsTrigger></TabsList>
        <TabsContent value="alerts">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Trade AML Alerts</CardTitle></CardHeader>
            <CardContent>
              {aLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Trade Type</TableHead><TableHead>Alert Type</TableHead><TableHead>Risk Score</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {alerts.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No trade AML alerts.</TableCell></TableRow> : alerts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="capitalize font-medium">{a.trade_type}</TableCell>
                        <TableCell className="capitalize">{a.alert_type.replace(/_/g, " ")}</TableCell>
                        <TableCell><Badge className={a.risk_score >= 70 ? "bg-red-500/10 text-red-600" : a.risk_score >= 40 ? "bg-amber-500/10 text-amber-600" : "bg-muted"}>{a.risk_score}</Badge></TableCell>
                        <TableCell><Badge className={a.status === "closed" ? "bg-emerald-500/10 text-emerald-600" : a.status === "open" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}>{a.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, h:mm a")}</TableCell>
                        <TableCell className="text-right">
                          {a.status === "open" && <Button size="sm" variant="outline" onClick={() => closeAlert.mutate(a.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Close</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rules">
          <Card>
            <CardHeader><CardTitle>Detection Rules</CardTitle></CardHeader>
            <CardContent>
              {rLoading ? <Skeleton className="h-24 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Rule Name</TableHead><TableHead>Type</TableHead><TableHead>Trade</TableHead><TableHead>Threshold</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rules.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.rule_name}</TableCell>
                        <TableCell className="capitalize">{r.rule_type}</TableCell>
                        <TableCell className="capitalize">{r.trade_type}</TableCell>
                        <TableCell className="font-mono">{r.threshold ? r.threshold.toLocaleString() : "—"}</TableCell>
                        <TableCell>{r.is_active ? <Badge className="bg-emerald-500/10 text-emerald-600">Active</Badge> : <Badge className="bg-muted">Inactive</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => toggleRule.mutate({ id: r.id, is_active: !r.is_active })}>{r.is_active ? "Disable" : "Enable"}</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}
