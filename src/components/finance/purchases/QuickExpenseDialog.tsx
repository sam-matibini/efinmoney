import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentsPanel } from "./AttachmentsPanel";

export const QuickExpenseDialog = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: wallets = [] } = useWallets();
  const [open, setOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    expense_date: today,
    merchant: "",
    description: "",
    category: "Supplies",
    amount: "",
    tax_amount: "",
    currency_code: "CAD",
    gl_account_id: "",
    pay_from: "reimbursable" as "reimbursable" | "wallet",
    wallet_id: "",
    notes: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["expense-accounts-quick"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ledger_accounts").select("id, code, name")
        .like("code", "6%").order("code");
      return data || [];
    },
  });

  const reset = () => {
    setForm({ ...form, merchant: "", description: "", amount: "", tax_amount: "", notes: "", wallet_id: "" });
    setCreatedId(null);
    setOpen(false);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const amt = parseFloat(form.amount);
      const tax = parseFloat(form.tax_amount || "0");
      if (!amt || amt <= 0) throw new Error("Amount required");
      if (!form.description) throw new Error("Description required");

      const { data: cn, error: cnErr } = await supabase.rpc("generate_expense_claim_number");
      if (cnErr) throw cnErr;

      const { data: claim, error } = await supabase
        .from("expense_claims")
        .insert({
          claim_number: cn as unknown as string,
          submitter_user_id: user.id,
          purpose: form.description,
          currency_code: form.currency_code,
          subtotal: amt,
          tax_amount: tax,
          total: amt + tax,
          status: form.pay_from === "wallet" ? "reimbursed" : "draft",
          submitted_at: form.pay_from === "wallet" ? new Date().toISOString() : null,
        })
        .select().single();
      if (error) throw error;

      await supabase.from("expense_claim_items").insert([{
        claim_id: claim.id,
        description: form.description,
        category: form.category,
        amount: amt,
        tax_amount: tax,
        expense_date: form.expense_date,
        currency_code: form.currency_code,
        gl_account_id: form.gl_account_id || null,
        merchant: form.merchant || null,
      }]);

      // If paid from wallet, post ledger immediately
      if (form.pay_from === "wallet" && form.wallet_id && form.gl_account_id) {
        const { data: la } = await supabase.from("ledger_accounts")
          .select("id").like("code", "21%").eq("currency_code", form.currency_code).limit(1).maybeSingle();
        if (la?.id) {
          const journalId = crypto.randomUUID();
          await supabase.from("ledger_entries").insert([
            {
              journal_id: journalId, account_id: form.gl_account_id,
              currency_code: form.currency_code, debit_amount: amt + tax, credit_amount: 0,
              description: `Expense: ${form.description}`, reference_type: "expense_claim",
              reference_id: claim.id, created_by: user.id,
            },
            {
              journal_id: journalId, account_id: la.id, wallet_id: form.wallet_id,
              currency_code: form.currency_code, debit_amount: 0, credit_amount: amt + tax,
              description: `Expense: ${form.description}`, reference_type: "expense_claim",
              reference_id: claim.id, created_by: user.id,
            },
          ]);
        }
      }

      return claim;
    },
    onSuccess: (claim) => {
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      setCreatedId(claim.id);
      toast.success("Expense recorded — attach your receipt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Plus className="w-4 h-4 mr-2" />Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" /> Quick Expense
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Merchant / Vendor</Label>
              <Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="e.g. Staples" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description *</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Meals","Travel","Lodging","Supplies","Software","Utilities","Other"].map((c) =>
                    <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tax</Label>
              <Input type="number" step="0.01" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["CAD","USD","EUR","GBP","NGN","KES","BWP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>GL Account</Label>
              <Select value={form.gl_account_id} onValueChange={(v) => setForm({ ...form, gl_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pay from</Label>
              <Select value={form.pay_from} onValueChange={(v: any) => setForm({ ...form, pay_from: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wallet">Wallet (post now)</SelectItem>
                  <SelectItem value="reimbursable">Reimbursable claim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.pay_from === "wallet" && (
              <div className="space-y-1">
                <Label>Wallet</Label>
                <Select value={form.wallet_id} onValueChange={(v) => setForm({ ...form, wallet_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {createdId && (
            <div className="border rounded-lg p-3 bg-muted/20">
              <AttachmentsPanel parentType="expense_claim" parentId={createdId} />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>{createdId ? "Done" : "Cancel"}</Button>
            {!createdId && (
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Save expense"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
