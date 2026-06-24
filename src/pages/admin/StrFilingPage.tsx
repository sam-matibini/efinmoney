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
import { Textarea } from "@/components/ui/textarea";
import { FileWarning, Plus, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { draft: "bg-muted", filed: "bg-blue-500/10 text-blue-600", acknowledged: "bg-emerald-500/10 text-emerald-600", closed: "bg-slate-500/10 text-slate-600" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export default function StrFilingPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ report_type: "str", suspicion_type: "money_laundering", description: "", amount: "", currency_code: "CAD" });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["str-reports"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("str_reports").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("str_reports").insert({ ...form, amount: form.amount ? Number(form.amount) : null, filed_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["str-reports"] }); setShowAdd(false); setForm({ report_type: "str", suspicion_type: "money_laundering", description: "", amount: "", currency_code: "CAD" }); toast.success("STR created"); },
    onError: () => toast.error("Failed to create STR"),
  });

  const fileMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("str_reports").update({ status: "filed", filed_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["str-reports"] }); toast.success("Report filed"); },
  });

  const filed = reports.filter((r: any) => r.status === "filed" || r.status === "acknowledged").length;

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">STR / SAR Filing</h1><p className="text-muted-foreground">Suspicious Transaction & Activity Reports — FINTRAC filing workflow</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />New STR</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{reports.length}</div><div className="text-xs text-muted-foreground">Total reports</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{reports.filter((r: any) => r.status === "draft").length}</div><div className="text-xs text-muted-foreground">Draft</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{filed}</div><div className="text-xs text-muted-foreground">Filed</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileWarning className="w-5 h-5" />Report Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Suspicion</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Filed</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No STR/SAR reports.</TableCell></TableRow> : reports.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="uppercase font-medium">{r.report_type}</TableCell>
                    <TableCell className="capitalize text-sm">{r.suspicion_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono">{r.amount ? `${r.currency_code} ${Number(r.amount).toLocaleString()}` : "—"}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs">{r.filed_at ? format(new Date(r.filed_at), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{r.filing_reference || "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "draft" && <Button size="sm" onClick={() => fileMutation.mutate(r.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />File</Button>}
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
          <DialogHeader><DialogTitle>New Suspicious Transaction Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Report Type</Label>
                <Select value={form.report_type} onValueChange={(v) => setForm({ ...form, report_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="str">STR</SelectItem><SelectItem value="sar">SAR</SelectItem><SelectItem value="voluntary">Voluntary</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Suspicion Type</Label>
                <Select value={form.suspicion_type} onValueChange={(v) => setForm({ ...form, suspicion_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="money_laundering">Money Laundering</SelectItem>
                    <SelectItem value="terrorist_financing">Terrorist Financing</SelectItem>
                    <SelectItem value="fraud">Fraud</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" type="number" /></div>
              <div><Label>Currency</Label><Input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })} /></div>
            </div>
            <div><Label>Description of Suspicion</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the suspicious activity..." rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.description}>{addMutation.isPending ? "Creating..." : "Create Draft"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
