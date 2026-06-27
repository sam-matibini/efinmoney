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
import { Plus, Receipt, Trash2, CheckCircle2, X, Banknote, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { QuickExpenseDialog } from "./QuickExpenseDialog";
import { AttachmentsPanel } from "./AttachmentsPanel";


const colors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500",
  submitted: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  reimbursed: "bg-green-500/10 text-green-500",
  rejected: "bg-red-500/10 text-red-500",
};

interface ExpLine {
  description: string;
  category: string;
  amount: number;
  tax_amount: number;
  expense_date: string;
  gl_account_id?: string;
  merchant?: string;
}

export const ExpenseClaimsPanel = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({ purpose: "", currency_code: "CAD" });
  const [lines, setLines] = useState<ExpLine[]>([
    { description: "", category: "Meals", amount: 0, tax_amount: 0, expense_date: today },
  ]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["expense-accounts-only"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ledger_accounts")
        .select("id, code, name")
        .like("code", "6%")
        .order("code");
      return data || [];
    },
  });

  const { data: claims = [] } = useQuery({
    queryKey: ["expense-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_claims")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const taxTotal = lines.reduce((s, l) => s + (l.tax_amount || 0), 0);
  const total = subtotal + taxTotal;

  const reset = () => {
    setForm({ purpose: "", currency_code: "CAD" });
    setLines([{ description: "", category: "Meals", amount: 0, tax_amount: 0, expense_date: today }]);
    setOpen(false);
  };

  const createMut = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!user?.id) throw new Error("Not signed in");
      const { data: cn, error: cnErr } = await supabase.rpc("generate_expense_claim_number");
      if (cnErr) throw cnErr;
      const { data: claim, error } = await supabase
        .from("expense_claims")
        .insert({
          claim_number: cn as unknown as string,
          submitter_user_id: user.id,
          purpose: form.purpose,
          currency_code: form.currency_code,
          subtotal,
          tax_amount: taxTotal,
          total,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      const items = lines
        .filter((l) => l.description)
        .map((l) => ({
          claim_id: claim.id,
          description: l.description,
          category: l.category,
          amount: l.amount,
          tax_amount: l.tax_amount,
          expense_date: l.expense_date,
          currency_code: form.currency_code,
          gl_account_id: l.gl_account_id || null,
          merchant: l.merchant || null,
        }));
      if (items.length) {
        const { error: iErr } = await supabase.from("expense_claim_items").insert(items);
        if (iErr) throw iErr;
      }
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
      const { data, error } = await supabase.functions.invoke("expense-claim-process", {
        body: { claim_id: id, action },
      });
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
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" /> Expense Claims
        </CardTitle>
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Claim</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Expense Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Purpose</Label>
                  <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["CAD","USD","EUR","GBP","NGN","KES","BWP"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>GL</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell><Input type="date" className="w-36" value={l.expense_date} onChange={(e) => updateLine(i, "expense_date", e.target.value)} /></TableCell>
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
                          <SelectContent className="max-h-72">
                            {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" step="0.01" className="text-right w-24" value={l.amount} onChange={(e) => updateLine(i, "amount", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell><Input type="number" step="0.01" className="text-right w-20" value={l.tax_amount} onChange={(e) => updateLine(i, "tax_amount", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, x) => x !== i))} disabled={lines.length <= 1}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button variant="outline" className="w-full" onClick={() => setLines([...lines, { description: "", category: "Meals", amount: 0, tax_amount: 0, expense_date: today }])}>
                <Plus className="w-4 h-4 mr-2" /> Add Line
              </Button>
              <div className="flex justify-end text-sm font-bold">
                Total: {form.currency_code} {total.toFixed(2)}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => createMut.mutate("draft")} disabled={createMut.isPending}>Save Draft</Button>
                <Button onClick={() => createMut.mutate("submitted")} disabled={createMut.isPending || !form.purpose}>Submit for Approval</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No expense claims</TableCell></TableRow>
            ) : claims.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.claim_number}</TableCell>
                <TableCell>{c.purpose || "-"}</TableCell>
                <TableCell className="text-xs">{c.submitted_at ? format(new Date(c.submitted_at), "MMM d") : "-"}</TableCell>
                <TableCell className="text-right font-mono">{c.currency_code} {Number(c.total).toFixed(2)}</TableCell>
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
