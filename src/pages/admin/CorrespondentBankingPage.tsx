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
import { Landmark, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const riskBadge = (r: string) => {
  const m: Record<string, string> = { low: "bg-emerald-500/10 text-emerald-600", medium: "bg-amber-500/10 text-amber-600", high: "bg-red-500/10 text-red-600", prohibited: "bg-red-700/10 text-red-700 font-bold" };
  return <Badge className={m[r] || ""}>{r}</Badge>;
};

export default function CorrespondentBankingPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ bank_name: "", swift_code: "", country_code: "", risk_level: "medium" });

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ["correspondent-banks"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("correspondent_banks").select("*").order("bank_name");
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("correspondent_banks").insert({ ...form, status: "active", due_diligence_date: new Date().toISOString().split("T")[0] });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["correspondent-banks"] }); setShowAdd(false); setForm({ bank_name: "", swift_code: "", country_code: "", risk_level: "medium" }); toast.success("Bank added"); },
    onError: () => toast.error("Failed to add bank"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("correspondent_banks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correspondent-banks"] }),
  });

  const active = banks.filter((b: any) => b.status === "active").length;
  const highRisk = banks.filter((b: any) => b.risk_level === "high" || b.risk_level === "prohibited").length;

  return (
    <AdminLayout>
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Correspondent Banking</h1><p className="text-muted-foreground">Approved bank relationships, due diligence records, and risk ratings</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Bank</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{banks.length}</div><div className="text-xs text-muted-foreground">Total banks</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{active}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{highRisk}</div><div className="text-xs text-muted-foreground">High risk / Prohibited</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" />Bank Relationships</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Bank Name</TableHead><TableHead>SWIFT</TableHead><TableHead>Country</TableHead><TableHead>Risk</TableHead><TableHead>FATF</TableHead><TableHead>Status</TableHead><TableHead>Due Diligence</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {banks.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No correspondent banks. Add your first relationship above.</TableCell></TableRow> : banks.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.bank_name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.swift_code || "—"}</TableCell>
                    <TableCell>{b.country_code}</TableCell>
                    <TableCell>{riskBadge(b.risk_level)}</TableCell>
                    <TableCell>{b.fatf_member ? <Badge className="bg-emerald-500/10 text-emerald-600">Member</Badge> : <Badge className="bg-muted">Non-member</Badge>}</TableCell>
                    <TableCell><Badge className={b.status === "active" ? "bg-emerald-500/10 text-emerald-600" : b.status === "suspended" ? "bg-amber-500/10 text-amber-600" : "bg-muted"}>{b.status}</Badge></TableCell>
                    <TableCell className="text-xs">{b.due_diligence_date ? format(new Date(b.due_diligence_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {b.status === "active" && <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: b.id, status: "suspended" })}>Suspend</Button>}
                      {b.status === "suspended" && <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: b.id, status: "active" })}>Reinstate</Button>}
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
          <DialogHeader><DialogTitle>Add Correspondent Bank</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g., HSBC Canada" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SWIFT Code</Label><Input value={form.swift_code} onChange={(e) => setForm({ ...form, swift_code: e.target.value })} placeholder="e.g., HKBCCATT" /></div>
              <div><Label>Country Code</Label><Input value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} placeholder="CA" maxLength={2} /></div>
            </div>
            <div><Label>Risk Level</Label>
              <Select value={form.risk_level} onValueChange={(v) => setForm({ ...form, risk_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem><SelectItem value="prohibited">Prohibited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.bank_name || !form.country_code}>{addMutation.isPending ? "Adding..." : "Add Bank"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
