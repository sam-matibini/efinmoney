import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, CheckCircle2, AlertTriangle, Search, Plus } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { pending_questionnaire: "bg-amber-500/10 text-amber-600", documents_submitted: "bg-blue-500/10 text-blue-600", under_review: "bg-purple-500/10 text-purple-600", approved: "bg-emerald-500/10 text-emerald-600", rejected: "bg-red-500/10 text-red-600", more_info_needed: "bg-orange-500/10 text-orange-600" };
  return <Badge className={m[s] || ""}>{s.replace(/_/g, " ")}</Badge>;
};

export default function EddWorkflowPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["edd-cases"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("edd_cases").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await (supabase as any).from("edd_cases").update({ status, reviewed_at: status === "approved" || status === "rejected" ? new Date().toISOString() : null, reviewed_by: (await supabase.auth.getUser()).data.user?.id }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["edd-cases"] }),
  });

  const open = cases.filter((c: any) => c.status !== "approved" && c.status !== "rejected").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Enhanced Due Diligence (EDD)</h1><p className="text-muted-foreground">High-risk review workflow — questionnaires, documents, and compliance approval</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{cases.length}</div><div className="text-xs text-muted-foreground">Total cases</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{open}</div><div className="text-xs text-muted-foreground">Open / pending</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{cases.filter((c: any) => c.status === "approved").length}</div><div className="text-xs text-muted-foreground">Approved</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />EDD Cases</CardTitle>
          <div className="relative w-64"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer..." className="pl-9" /></div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Trigger Reason</TableHead><TableHead>Status</TableHead><TableHead>Assigned To</TableHead><TableHead>Reviewed</TableHead><TableHead className="text-right">Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {cases.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No EDD cases.</TableCell></TableRow> : cases.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium capitalize">{c.trigger_reason.replace(/_/g, " ")}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.assigned_to ? "✓ Assigned" : "—"}</TableCell>
                    <TableCell className="text-xs">{c.reviewed_at ? format(new Date(c.reviewed_at), "MMM d") : "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d")}</TableCell>
                    <TableCell className="text-right">
                      {c.status === "documents_submitted" && <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: c.id, status: "under_review" })}>Review</Button>}
                      {c.status === "under_review" && <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: c.id, status: "approved" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve</Button><Button size="sm" variant="outline" className="text-red-500" onClick={() => updateMutation.mutate({ id: c.id, status: "rejected" })}>Reject</Button></div>}
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