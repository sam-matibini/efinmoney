import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { pending: "bg-amber-500/10 text-amber-600", in_progress: "bg-blue-500/10 text-blue-600", completed: "bg-emerald-500/10 text-emerald-600", flagged: "bg-red-500/10 text-red-600" };
  return <Badge className={m[s] || ""}>{s.replace(/_/g, " ")}</Badge>;
};

const riskBadge = (score: number) => {
  if (score >= 70) return <Badge className="bg-red-500/10 text-red-600">High {score}</Badge>;
  if (score >= 40) return <Badge className="bg-amber-500/10 text-amber-600">Medium {score}</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-600">Low {score}</Badge>;
};

export default function CddWorkflowPage() {
  const qc = useQueryClient();

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cdd-questionnaires"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("cdd_questionnaires").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "completed") { update.reviewed_by = (await supabase.auth.getUser()).data.user?.id; update.reviewed_at = new Date().toISOString(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("cdd_questionnaires").update(update).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cdd-questionnaires"] }); toast.success("Updated"); },
  });

  const pending = cases.filter((c: any) => c.status === "pending").length;
  const flagged = cases.filter((c: any) => c.status === "flagged").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Customer Due Diligence (CDD)</h1><p className="text-muted-foreground">Source of funds, source of wealth, PEP/sanctions declarations</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{cases.length}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pending}</div><div className="text-xs text-muted-foreground">Pending review</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{flagged}</div><div className="text-xs text-muted-foreground">Flagged</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5" />CDD Questionnaires</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Status</TableHead><TableHead>Risk Score</TableHead><TableHead>PEP</TableHead><TableHead>Source of Funds</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {cases.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No CDD questionnaires. These are created automatically for high-risk customers.</TableCell></TableRow> : cases.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="capitalize font-medium">{c.cdd_level}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell>{riskBadge(c.risk_score || 0)}</TableCell>
                    <TableCell>{c.pep_declared ? <Badge className="bg-red-500/10 text-red-600"><AlertTriangle className="w-3 h-3 mr-1" />Declared</Badge> : <Badge className="bg-muted">None</Badge>}</TableCell>
                    <TableCell className="max-w-40 truncate text-sm">{c.source_of_funds || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      {c.status === "pending" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: c.id, status: "in_progress" })}>Start Review</Button>}
                      {c.status === "in_progress" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: c.id, status: "completed" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Complete</Button>
                          <Button size="sm" variant="outline" className="text-red-500" onClick={() => advanceMutation.mutate({ id: c.id, status: "flagged" })}>Flag</Button>
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
    </AdminLayout>
  );
}
