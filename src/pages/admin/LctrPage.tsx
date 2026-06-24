import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export default function LctrPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ cash_amount: "", currency_code: "CAD", transaction_type: "deposit", notes: "" });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["lctr-reports"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("lctr_reports").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("lctr_reports").insert({ ...form, cash_amount: Number(form.cash_amount) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lctr-reports"] }); setShowAdd(false); setForm({ cash_amount: "", currency_code: "CAD", transaction_type: "deposit", notes: "" }); toast.success("LCTR created"); },
    onError: () => toast.error("Failed to create LCTR"),
  });

  const fileMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("lctr_reports").update({ status: "filed", filed_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lctr-reports"] }); toast.success("LCTR filed"); },
  });

  const pending = reports.filter((r: any) => r.status === "pending").length;
  const total = reports.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Large Cash Reporting (LCTR)</h1><p className="text-muted-foreground">FINTRAC mandatory reporting — cash transactions ≥ $10,000 CAD</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />New LCTR</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{reports.length}</div><div className="text-xs text-muted-foreground">Total reports</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pending}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold font-mono text-sm">{total.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}</div><div className="text-xs text-muted-foreground">Total reported</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="w-5 h-5" />LCTR Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Filed</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No LCTR reports.</TableCell></TableRow> : reports.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-medium">{r.currency_code} {Number(r.cash_amount).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{r.transaction_type}</TableCell>
                    <TableCell className="text-xs">{format(new Date(r.report_date), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge className={r.status === "filed" || r.status === "acknowledged" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{r.filed_at ? format(new Date(r.filed_at), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{r.filing_reference || "—"}</TableCell>
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

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Large Cash Transaction Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cash Amount</Label><Input value={form.cash_amount} onChange={(e) => setForm({ ...form, cash_amount: e.target.value })} type="number" placeholder="10000" /></div>
              <div><Label>Currency</Label><Input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })} /></div>
            </div>
            <div><Label>Transaction Type</Label>
              <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="deposit">Deposit</SelectItem><SelectItem value="withdrawal">Withdrawal</SelectItem><SelectItem value="exchange">Exchange</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.cash_amount}>{addMutation.isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
