import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, SearchCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { matched: "bg-emerald-500/10 text-emerald-600", variance: "bg-red-500/10 text-red-600", missing: "bg-amber-500/10 text-amber-600", duplicate: "bg-purple-500/10 text-purple-600", pending: "bg-muted" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export const SettlementReconciliationPanel = () => {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["settlement-reconciliations"],
    queryFn: async () => {
      const { data } = await supabase.from("settlement_reconciliations").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const matched = items.filter((i: any) => i.status === "matched").length;
  const variances = items.filter((i: any) => i.status === "variance").length;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{items.length}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{matched}</div><div className="text-xs text-muted-foreground">Matched</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{variances}</div><div className="text-xs text-muted-foreground">Variances</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><SearchCheck className="w-5 h-5" />3-Way Settlement Reconciliation</CardTitle><p className="text-sm text-muted-foreground">Processor Settlement vs eFinMoney Ledger vs Bank Statement</p></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Processor</TableHead><TableHead className="text-right">Processor $</TableHead><TableHead className="text-right">Ledger $</TableHead><TableHead className="text-right">Bank $</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No reconciliations yet.</TableCell></TableRow> : items.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium capitalize">{i.processor}</TableCell>
                    <TableCell className="text-right font-mono">{Number(i.processor_settlement_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{Number(i.efinmoney_ledger_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{i.bank_statement_amount ? Number(i.bank_statement_amount).toFixed(2) : "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${Number(i.variance_amount) > 0.01 ? "text-red-500" : ""}`}>{Number(i.variance_amount).toFixed(2)}</TableCell>
                    <TableCell>{statusBadge(i.status)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(i.created_at), "MMM d")}</TableCell>
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