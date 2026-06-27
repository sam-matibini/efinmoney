import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Receipt, Trash2, CheckCircle2, X, Banknote } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const colors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500",
  submitted: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  reimbursed: "bg-green-500/10 text-green-500",
  rejected: "bg-red-500/10 text-red-500",
};

interface ExpLine { description: string; category: string; amount: number; tax_amount: number; gl_account_id?: string; }

export const ExpenseClaimsPanel = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", currency_code: "CAD", expense_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const [lines, setLines] = useState<ExpLine[]>([{ description: "", category: "Meals", amount: 0, tax_amount: 0 }]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["expense-accounts-only"],
    queryFn: async () => {
      const { data } = await supabase.from("ledger_accounts").select("id, code, name").like("code", "6%").order("code");
      return data || [];
    },
  });

  const { data: claims = [] } = useQuery({
    queryKey: ["expense-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_claims")
        .select("*, profiles:user_id(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const total = lines.reduce((s, l) => s + l.amount + l.tax_amount, 0);

  const reset = () => {
    setForm({ title: "", currency_code: "CAD", expense_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    setLines([{ description: "", category: "Meals", amount: 0, tax_amount: 0 }]);
    setOpen(false);
  };

  const createMut = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const { data: en } = await supabase.rpc("generate_expense_number");
      const { data: claim, error } = await supabase
        .from("expense_claims")
        .insert({
          expense_number: en as unknown as string,
          user_id: user?.id,
          title: form.title,
          currency_code: form.currency_code,
          expense_date: form.expense_date,
          notes: form.notes,
          total_amount: total,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("expense_claim_items").insert(
        lines.filter((l) => l.description).map((l) => ({
          claim_id: claim.id,
          description: l.description,
          category: l.category,
          amount: l.amount,
          tax_amount: l.tax_amount,
          gl_account_id: l.gl_account_id || null,
        })),
      );
      return claim;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Claim saved");
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "submit" | "approve" | "reject" | "reimburse" }) => {
      const { data, error } = await supabase.functions.invoke("expense-claim-process", { body: { claim_id: id, action } });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try { if (ctx?.json) msg = (await ctx.json())?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLine = (i: number, key: keyof ExpLine, value: any) => {
    const next = [...lines];
    (next[i] as any)[key] = value;
    setLines(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" />Expense Claims</CardTitle>
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />New Claim</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Expense Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1"><Label>Currency</Label>
                  <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["CAD","USD","EUR","GBP","NGN","KES","BWP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead>GL</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Tax</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell><Input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} /></TableCell>
                      <TableCell>
                        <Select value={l.category} onValueChange={(v) => updateLine(i, "category", v)}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>{["Meals","Travel","Lodging","Supplies","Software","Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={l.gl_account_id || ""} onValueChange={(v) => updateLine(i, "gl_account_id", v)}>
                          <SelectTrigger className="w-40"><SelectValue placeholder="Account" /></SelectTrigger>
                          <SelectContent className="max-h-72">{accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" step="0.01" className="text-right w-24" value={l.amount} onChange={(e) => updateLine(i, "amount", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" step="0.01" className="text-right w-20" value={l.tax_amount} onChange={(e) => updateLine(i, "tax_amount", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, x) => x !== i))} disabled={lines.length <= 1}><Trash2 className="w-4 h-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button variant="outline" className="w-full" onClick={() => setLines([...lines, { description: "", category: "Meals", amount: 0, tax_amount: 0 }])}><Plus className="w-4 h-4 mr-2" />Add Line</Button>
              <div className="flex justify-end text-sm font-bold">Total: {form.currency_code} {total.toFixed(2)}</div>
              <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => createMut.mutate("draft")} disabled={createMut.isPending}>Save Draft</Button>
                <Button onClick={() => createMut.mutate("submitted")} disabled={createMut.isPending || !form.title}>Submit for Approval</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Title</TableHead><TableHead>User</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {claims.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No expense claims</TableCell></TableRow> :
              claims.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.expense_number}</TableCell>
                  <TableCell>{c.title}</TableCell>
                  <TableCell className="text-xs">{c.profiles?.full_name || c.profiles?.email || "-"}</TableCell>
                  <TableCell>{format(new Date(c.expense_date), "MMM d")}</TableCell>
                  <TableCell className="text-right font-mono">{c.currency_code} {Number(c.total_amount).toFixed(2)}</TableCell>
                  <TableCell><Badge className={colors[c.status]}>{c.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {c.status === "draft" && <Button size="sm" variant="outline" onClick={() => actionMut.mutate({ id: c.id, action: "submit" })}>Submit</Button>}
                    {c.status === "submitted" && <>
                      <Button size="sm" variant="outline" onClick={() => actionMut.mutate({ id: c.id, action: "approve" })}><CheckCircle2 className="w-3 h-3 mr-1" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => actionMut.mutate({ id: c.id, action: "reject" })}><X className="w-3 h-3 mr-1" />Reject</Button>
                    </>}
                    {c.status === "approved" && <Button size="sm" onClick={() => actionMut.mutate({ id: c.id, action: "reimburse" })}><Banknote className="w-3 h-3 mr-1" />Reimburse</Button>}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
