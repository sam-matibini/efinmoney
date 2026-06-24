import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const statusBadge = (s: string) => {
  const m: Record<string, string> = {
    identified: "bg-blue-500/10 text-blue-600",
    escalated_1d: "bg-amber-500/10 text-amber-600",
    escalated_3d: "bg-orange-500/10 text-orange-600",
    escalated_7d: "bg-red-500/10 text-red-600",
    escalated_30d: "bg-red-600/10 text-red-600",
    resolved: "bg-emerald-500/10 text-emerald-600",
    written_off: "bg-muted text-muted-foreground",
  };
  return <Badge className={m[s] || ""}>{s.replace(/_/g, " ")}</Badge>;
};

export const UnclaimedFundsPanel = () => {
  const qc = useQueryClient();
  const { data: funds = [], isLoading } = useQuery({
    queryKey: ["unclaimed-funds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("unclaimed_funds").select("*").order("days_outstanding", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "resolved" | "written_off" }) => {
      await (supabase as any).from("unclaimed_funds").update({ status: action, resolved_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["unclaimed-funds"] }); toast.success("Updated"); },
  });

  const total = funds.reduce((s: number, f: any) => s + Number(f.amount), 0);
  const escalated = funds.filter((f: any) => f.status.startsWith("escalated")).length;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{funds.length}</div><div className="text-xs text-muted-foreground">Total items</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{escalated}</div><div className="text-xs text-muted-foreground">Escalated</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold font-mono">{total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div><div className="text-xs text-muted-foreground">Total unclaimed</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Unclaimed Funds Register</CardTitle>
          <p className="text-sm text-muted-foreground">Unknown deposits, unallocated funds, returned payments, failed settlements — escalating at 1/3/7/30 days</p>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Currency</TableHead><TableHead>Source</TableHead><TableHead>Days Outstanding</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {funds.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No unclaimed funds.</TableCell></TableRow> : funds.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono font-medium">{Number(f.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{f.currency_code}</TableCell>
                    <TableCell className="capitalize">{f.source_type.replace(/_/g, " ")}</TableCell>
                    <TableCell><span className={f.days_outstanding > 7 ? "text-red-500 font-bold" : f.days_outstanding > 3 ? "text-amber-500" : ""}>{f.days_outstanding} days</span></TableCell>
                    <TableCell>{statusBadge(f.status)}</TableCell>
                    <TableCell className="text-right">
                      {f.status !== "resolved" && f.status !== "written_off" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: f.id, action: "resolved" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Resolve</Button>
                        </div>
                      )}
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