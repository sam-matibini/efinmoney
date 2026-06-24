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
import { Shield, Plus, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

const statusBadge = (s: string) => {
  const m: Record<string, string> = { active: "bg-emerald-500/10 text-emerald-600", draft: "bg-amber-500/10 text-amber-600", archived: "bg-muted text-muted-foreground" };
  return <Badge className={m[s] || ""}>{s}</Badge>;
};

export default function AmlPolicyPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ policy_name: "", category: "aml", version: "1.0" });

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["aml-policies"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("aml_policies").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("aml_policies").insert({ ...form, status: "draft" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aml-policies"] }); setShowAdd(false); setForm({ policy_name: "", category: "aml", version: "1.0" }); toast.success("Policy created"); },
    onError: () => toast.error("Failed to create policy"),
  });

  const activateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("aml_policies").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aml-policies"] }),
  });

  const active = policies.filter((p: any) => p.status === "active").length;

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">AML/CTF Policy Hub</h1><p className="text-muted-foreground">Policy register, version control, and approval workflow</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />New Policy</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{policies.length}</div><div className="text-xs text-muted-foreground">Total policies</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{active}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{policies.filter((p: any) => p.status === "draft").length}</div><div className="text-xs text-muted-foreground">Draft</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Policy Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Policy Name</TableHead><TableHead>Category</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Effective</TableHead><TableHead>Review</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {policies.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No policies yet.</TableCell></TableRow> : policies.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.policy_name}</TableCell>
                    <TableCell className="capitalize">{p.category.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-xs">v{p.version}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell className="text-xs">{p.effective_date ? format(new Date(p.effective_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{p.review_date ? format(new Date(p.review_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => activateMutation.mutate({ id: p.id, status: "active" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Activate</Button>}
                      {p.status === "active" && <Button size="sm" variant="outline" onClick={() => activateMutation.mutate({ id: p.id, status: "archived" })}>Archive</Button>}
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
          <DialogHeader><DialogTitle>New AML/CTF Policy</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Policy Name</Label><Input value={form.policy_name} onChange={(e) => setForm({ ...form, policy_name: e.target.value })} placeholder="e.g., AML Program — Customer Risk Assessment" /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aml">AML</SelectItem>
                  <SelectItem value="ctf">CTF</SelectItem>
                  <SelectItem value="sanctions">Sanctions</SelectItem>
                  <SelectItem value="pep">PEP</SelectItem>
                  <SelectItem value="kyc">KYC/CDD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Version</Label><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.policy_name}>{addMutation.isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
