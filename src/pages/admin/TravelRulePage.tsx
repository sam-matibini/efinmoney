import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { pending: "bg-amber-500/10 text-amber-600", transmitted: "bg-blue-500/10 text-blue-600", received: "bg-emerald-500/10 text-emerald-600", failed: "bg-red-500/10 text-red-600" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export default function TravelRulePage() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["travel-rule-records"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("travel_rule_records").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const pending = records.filter((r: any) => r.status === "pending").length;
  const failed = records.filter((r: any) => r.status === "failed").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Travel Rule Compliance</h1><p className="text-muted-foreground">FATF Travel Rule — originator and beneficiary information for transfers ≥ $1,000</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{records.length}</div><div className="text-xs text-muted-foreground">Total records</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pending}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{failed}</div><div className="text-xs text-muted-foreground">Failed</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" />Travel Rule Records</CardTitle><p className="text-sm text-muted-foreground">Originator and beneficiary data transmitted to receiving VASPs</p></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Direction</TableHead><TableHead>Originator</TableHead><TableHead>Beneficiary</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {records.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No travel rule records. Records are created automatically for qualifying transfers.</TableCell></TableRow> : records.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge className={r.direction === "outbound" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}>{r.direction}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.originator_name}</div>
                      <div className="text-xs text-muted-foreground">{r.originator_vasp || r.originator_account || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.beneficiary_name}</div>
                      <div className="text-xs text-muted-foreground">{r.beneficiary_vasp || r.beneficiary_account || "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono">{r.currency_code} {Number(r.amount).toLocaleString()}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, h:mm a")}</TableCell>
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
