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
import { Shield, Plus, AlertTriangle } from "lucide-react";
import { useOperationalRisks, useCreateOperationalRisk, useUpdateOperationalRisk } from "@/hooks/useOperationalRisks";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const categoryLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const riskScoreBadge = (score: number) => {
  if (score >= 20) return <Badge className="bg-red-600/10 text-red-600">Critical ({score})</Badge>;
  if (score >= 15) return <Badge className="bg-orange-500/10 text-orange-600">High ({score})</Badge>;
  if (score >= 10) return <Badge className="bg-amber-500/10 text-amber-600">Medium ({score})</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600">Low ({score})</Badge>;
};

const CATEGORIES = ["settlement_failure", "fraud_event", "processor_outage", "cyber_attack", "kyc_failure", "regulatory_breach", "other"];
const STATUSES = ["identified", "mitigating", "accepted", "closed"];

export default function OperationalRiskPage() {
  const { data: risks = [], isLoading } = useOperationalRisks();
  const createRisk = useCreateOperationalRisk();
  const updateRisk = useUpdateOperationalRisk();
  const [showAdd, setShowAdd] = useState(false);

  const heatmapData = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => {
      const count = risks.filter((r) => r.likelihood === y + 1 && r.impact === x + 1).length;
      return { likelihood: y + 1, impact: x + 1, count };
    })
  );

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operational Risk Register</h1>
          <p className="text-muted-foreground">Risk = Likelihood × Impact</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Risk</Button>
      </div>

      {/* Risk heatmap */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Risk Heatmap (Likelihood × Impact)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-muted-foreground">Likelihood ↓ / Impact →</th>
                  {[1, 2, 3, 4, 5].map((i) => (<th key={i} className="p-1 text-center text-muted-foreground">{i}</th>))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row, y) => (
                  <tr key={y}>
                    <td className="p-1 text-muted-foreground">{5 - y}</td>
                    {row.map((cell, x) => (
                      <td key={x} className={`p-1 text-center border rounded ${cell.count > 0 ? (cell.likelihood * cell.impact >= 20 ? "bg-red-500/20 font-bold" : cell.likelihood * cell.impact >= 15 ? "bg-orange-500/20 font-semibold" : cell.likelihood * cell.impact >= 10 ? "bg-amber-500/10" : "bg-blue-500/5") : "bg-muted/20"}`}>
                        {cell.count || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Risk table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Risk Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Risk</TableHead><TableHead>Category</TableHead><TableHead>L</TableHead><TableHead>I</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Mitigation</TableHead></TableRow></TableHeader>
              <TableBody>
                {risks.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No operational risks registered.</TableCell></TableRow> : risks.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>{categoryLabel(r.category)}</TableCell>
                    <TableCell className="text-center">{r.likelihood}</TableCell>
                    <TableCell className="text-center">{r.impact}</TableCell>
                    <TableCell>{riskScoreBadge(r.risk_score)}</TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={(v) => updateRisk.mutate({ id: r.id, status: v })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{r.mitigation || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddRiskDialog open={showAdd} onClose={() => setShowAdd(false)} onSubmit={(p) => { createRisk.mutate(p, { onSuccess: () => { setShowAdd(false); toast.success("Risk added"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") }); }} isPending={createRisk.isPending} />
    </div>
    </AdminLayout>
  );
}

function AddRiskDialog({ open, onClose, onSubmit, isPending }: { open: boolean; onClose: () => void; onSubmit: (p: any) => void; isPending: boolean }) {
  const [form, setForm] = useState({ title: "", category: "fraud_event", likelihood: 3, impact: 3, mitigation: "" });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Operational Risk</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>))}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Likelihood (1-5)</Label><Input type="number" min={1} max={5} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value) })} /></div>
            <div><Label>Impact (1-5)</Label><Input type="number" min={1} max={5} value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Mitigation</Label><Input value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(form)} disabled={isPending || !form.title.trim()}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}