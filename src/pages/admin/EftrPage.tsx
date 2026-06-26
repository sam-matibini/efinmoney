import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function EftrPage() {
  const qc = useQueryClient();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["eftr-reports"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("eftr_reports").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const fileMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("eftr_reports").update({ status: "filed", filed_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["eftr-reports"] }); toast.success("EFTR filed"); },
  });

  const pending = reports.filter((r: any) => r.status === "pending").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Currency Exchange Reporting (EFTR)</h1><p className="text-muted-foreground">FINTRAC Electronic Funds Transfer Reports — exchanges ≥ $10,000 CAD</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{reports.length}</div><div className="text-xs text-muted-foreground">Total reports</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pending}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{reports.filter((r: any) => r.status === "filed" || r.status === "acknowledged").length}</div><div className="text-xs text-muted-foreground">Filed</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5" />EFTR Register</CardTitle><p className="text-sm text-muted-foreground">Exchange transactions auto-captured from FX trades above threshold</p></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Rate</TableHead><TableHead>CAD Equiv.</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No EFTR reports. Exchange transactions above $10,000 CAD are auto-captured.</TableCell></TableRow> : reports.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-medium">{Number(r.exchange_amount).toLocaleString()}</TableCell>
                    <TableCell><Badge className="bg-blue-500/10 text-blue-600">{r.from_currency}</Badge></TableCell>
                    <TableCell><Badge className="bg-purple-500/10 text-purple-600">{r.to_currency}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.exchange_rate ? Number(r.exchange_rate).toFixed(4) : "—"}</TableCell>
                    <TableCell className="font-mono">{r.equivalent_cad ? `CAD ${Number(r.equivalent_cad).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-xs">{format(new Date(r.report_date), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge className={r.status === "filed" || r.status === "acknowledged" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && <Button size="sm" onClick={() => fileMutation.mutate(r.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />File</Button>}
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
