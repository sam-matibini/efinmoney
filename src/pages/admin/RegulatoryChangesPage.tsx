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
import { BookOpen, Plus, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const impactBadge = (i: string) => {
  const m: Record<string, string> = { critical: "bg-red-600/10 text-red-600 font-bold", high: "bg-red-500/10 text-red-500", medium: "bg-amber-500/10 text-amber-600", low: "bg-blue-500/10 text-blue-600" };
  return <Badge className={m[i] || ""}>{i}</Badge>;
};

export default function RegulatoryChangesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ regulation_name: "", regulator: "fintrac", change_type: "amendment", description: "", impact_level: "medium", effective_date: "" });

  const { data: changes = [], isLoading } = useQuery({
    queryKey: ["regulatory-changes"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("regulatory_changes").select("*").order("effective_date", { ascending: true, nullsFirst: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("regulatory_changes").insert({ ...form, effective_date: form.effective_date || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["regulatory-changes"] }); setShowAdd(false); setForm({ regulation_name: "", regulator: "fintrac", change_type: "amendment", description: "", impact_level: "medium", effective_date: "" }); toast.success("Change logged"); },
    onError: () => toast.error("Failed to log change"),
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("regulatory_changes").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regulatory-changes"] }),
  });

  const open = changes.filter((c: any) => c.status === "monitoring" || c.status === "in_progress").length;
  const critical = changes.filter((c: any) => c.impact_level === "critical" && c.status !== "implemented").length;

  return (
    <AdminLayout>
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Regulatory Change Management</h1><p className="text-muted-foreground">Track FINTRAC, RPAA, OSFI regulatory changes and implementation status</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Log Change</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{changes.length}</div><div className="text-xs text-muted-foreground">Total changes</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{open}</div><div className="text-xs text-muted-foreground">In progress</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{critical}</div><div className="text-xs text-muted-foreground">Critical unimplemented</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" />Change Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Regulation</TableHead><TableHead>Regulator</TableHead><TableHead>Type</TableHead><TableHead>Impact</TableHead><TableHead>Status</TableHead><TableHead>Effective</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {changes.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No regulatory changes logged.</TableCell></TableRow> : changes.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium max-w-48 truncate">{c.regulation_name}</TableCell>
                    <TableCell className="uppercase text-xs font-mono">{c.regulator}</TableCell>
                    <TableCell className="capitalize text-sm">{c.change_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{impactBadge(c.impact_level)}</TableCell>
                    <TableCell><Badge className={c.status === "implemented" ? "bg-emerald-500/10 text-emerald-600" : c.status === "in_progress" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"}>{c.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{c.effective_date ? format(new Date(c.effective_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {c.status === "monitoring" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: c.id, status: "in_progress" })}>Start</Button>}
                      {c.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: c.id, status: "implemented" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Implement</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log Regulatory Change</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Regulation Name</Label><Input value={form.regulation_name} onChange={(e) => setForm({ ...form, regulation_name: e.target.value })} placeholder="e.g., PCMLTFA Amendment — Bill C-47" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Regulator</Label>
                <Select value={form.regulator} onValueChange={(v) => setForm({ ...form, regulator: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="fintrac">FINTRAC</SelectItem><SelectItem value="rpaa">RPAA</SelectItem><SelectItem value="osfi">OSFI</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Change Type</Label>
                <Select value={form.change_type} onValueChange={(v) => setForm({ ...form, change_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="new_regulation">New Regulation</SelectItem><SelectItem value="amendment">Amendment</SelectItem><SelectItem value="guidance">Guidance</SelectItem><SelectItem value="enforcement">Enforcement</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Impact Level</Label>
                <Select value={form.impact_level} onValueChange={(v) => setForm({ ...form, impact_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Effective Date</Label><Input value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} type="date" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What changed and how it affects the business..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.regulation_name}>{addMutation.isPending ? "Logging..." : "Log Change"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
