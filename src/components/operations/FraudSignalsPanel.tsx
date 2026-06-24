import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const severityBadge = (s: string) => {
  const m: Record<string, string> = { critical: "bg-red-600/10 text-red-600", high: "bg-orange-500/10 text-orange-600", medium: "bg-amber-500/10 text-amber-600", low: "bg-blue-500/10 text-blue-600" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export const FraudSignalsPanel = () => {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const qc = useQueryClient();

  const { data: signals = [], isLoading } = useQuery({
    queryKey: ["fraud-signals", typeFilter],
    queryFn: async () => {
      let q = supabase.from("fraud_signals").select("*").order("created_at", { ascending: false }).limit(50);
      if (typeFilter !== "all") q = q.eq("signal_type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["fraud-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("fraud_rules").select("*").eq("is_active", true);
      return data || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("fraud_signals").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fraud-signals"] });
      toast.success("Signal resolved");
    },
  });

  const openCount = signals.filter((s: any) => !s.resolved).length;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{signals.length}</div><div className="text-xs text-muted-foreground">Total signals</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{openCount}</div><div className="text-xs text-muted-foreground">Unresolved</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{rules.length}</div><div className="text-xs text-muted-foreground">Active rules</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" />Fraud Detection Signals</CardTitle>
            <p className="text-sm text-muted-foreground">Account takeover, synthetic identity, mule accounts, velocity abuse</p>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="account_takeover">Account Takeover</SelectItem>
              <SelectItem value="synthetic_identity">Synthetic Identity</SelectItem>
              <SelectItem value="mule_account">Mule Account</SelectItem>
              <SelectItem value="duplicate_identity">Duplicate Identity</SelectItem>
              <SelectItem value="velocity_abuse">Velocity Abuse</SelectItem>
              <SelectItem value="device_anomaly">Device Anomaly</SelectItem>
              <SelectItem value="geo_anomaly">Geo Anomaly</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Score</TableHead><TableHead>Details</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {signals.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No fraud signals detected.</TableCell></TableRow> : signals.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium capitalize">{s.signal_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{severityBadge(s.severity)}</TableCell>
                    <TableCell className="font-mono">{s.score ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs">{s.details ? JSON.stringify(s.details).slice(0, 60) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, h:mm a")}</TableCell>
                    <TableCell>{s.resolved ? <Badge className="bg-emerald-500/10 text-emerald-600">Resolved</Badge> : <Badge className="bg-amber-500/10 text-amber-600">Open</Badge>}</TableCell>
                    <TableCell className="text-right">
                      {!s.resolved && <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(s.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Resolve</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};