import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { complete: "bg-emerald-500/10 text-emerald-600", incomplete: "bg-amber-500/10 text-amber-600", flagged: "bg-red-500/10 text-red-600" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export default function WireTransfersPage() {
  const qc = useQueryClient();

  const { data: wires = [], isLoading } = useQuery({
    queryKey: ["wire-transfer-records"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("wire_transfer_records").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const flagMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("wire_transfer_records").update({ status: "flagged" }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wire-transfer-records"] }); toast.success("Flagged for review"); },
  });

  const flagged = wires.filter((w: any) => w.status === "flagged").length;
  const incomplete = wires.filter((w: any) => w.status === "incomplete").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Wire Transfer Act Compliance</h1><p className="text-muted-foreground">Originator and beneficiary PII — FINTRAC mandatory collection for all wire transfers</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{wires.length}</div><div className="text-xs text-muted-foreground">Total wires</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{incomplete}</div><div className="text-xs text-muted-foreground">Incomplete info</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{flagged}</div><div className="text-xs text-muted-foreground">Flagged</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" />Wire Transfer Records</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Direction</TableHead><TableHead>Originator</TableHead><TableHead>Beneficiary</TableHead><TableHead>Amount</TableHead><TableHead>SWIFT</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {wires.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No wire transfer records. Records created automatically for outbound wires.</TableCell></TableRow> : wires.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell><Badge className={w.direction === "outbound" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}>{w.direction}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{w.originator_name}</div>
                      <div className="text-xs text-muted-foreground">{w.originator_institution || w.originator_account || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{w.beneficiary_name}</div>
                      <div className="text-xs text-muted-foreground">{w.beneficiary_institution || w.beneficiary_account || "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono">{w.currency_code} {Number(w.amount).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{w.swift_code || "—"}</TableCell>
                    <TableCell>{statusBadge(w.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(w.created_at), "MMM d")}</TableCell>
                    <TableCell className="text-right">
                      {w.status !== "flagged" && <Button size="sm" variant="outline" className="text-red-500" onClick={() => flagMutation.mutate(w.id)}><AlertTriangle className="w-3.5 h-3.5 mr-1" />Flag</Button>}
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
