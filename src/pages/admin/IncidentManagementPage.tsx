import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const severityBadge = (s: string) => {
  const m: Record<string, string> = { critical: "bg-red-600/10 text-red-600", high: "bg-orange-500/10 text-orange-600", medium: "bg-amber-500/10 text-amber-600", low: "bg-blue-500/10 text-blue-600" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export default function IncidentManagementPage() {
  const qc = useQueryClient();

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("incidents").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["incidents"] }); toast.success("Incident resolved"); },
  });

  const open = incidents.filter((i: any) => i.status !== "resolved" && i.status !== "closed").length;
  const critical = incidents.filter((i: any) => i.severity === "critical" && i.status !== "resolved").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Incident Management</h1><p className="text-muted-foreground">Security, operational, and compliance incidents — tracking and escalation</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{incidents.length}</div><div className="text-xs text-muted-foreground">Total incidents</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{open}</div><div className="text-xs text-muted-foreground">Open</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{critical}</div><div className="text-xs text-muted-foreground">Critical open</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5" />Incident Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Reported</TableHead><TableHead>Resolved</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {incidents.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No incidents on record.</TableCell></TableRow> : incidents.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium max-w-48 truncate">{i.title || i.incident_type || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{i.incident_type?.replace(/_/g, " ") || "—"}</TableCell>
                    <TableCell>{severityBadge(i.severity || "medium")}</TableCell>
                    <TableCell><Badge className={i.status === "resolved" || i.status === "closed" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>{i.status}</Badge></TableCell>
                    <TableCell className="text-xs">{format(new Date(i.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-xs">{i.resolved_at ? format(new Date(i.resolved_at), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {i.status !== "resolved" && i.status !== "closed" && <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(i.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Resolve</Button>}
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
