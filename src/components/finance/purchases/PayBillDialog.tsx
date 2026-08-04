import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface PayBillDialogProps {
  bill: any | null;
  onClose: () => void;
}

export const PayBillDialog = ({ bill, onClose }: PayBillDialogProps) => {
  const qc = useQueryClient();
  const { data: wallets = [] } = useWallets();
  const outstanding = bill ? Number(bill.total_amount) - Number(bill.amount_paid || 0) : 0;
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<"wallet" | "eft" | "interac" | "cpn" | "pawapay" | "link" | "card" | "saved_card" | "stellar" | "mpesa" | "flutterwave" | "cheque" | "cash" | "wire" | "manual">("wallet");
  const [walletId, setWalletId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [extraField, setExtraField] = useState("");

  const [notes, setNotes] = useState("");

  const { data: payments = [] } = useQuery({
    queryKey: ["bill-payments", bill?.id],
    queryFn: async () => {
      if (!bill?.id) return [];
      const { data } = await supabase.from("vendor_bill_payments").select("*").eq("bill_id", bill.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!bill?.id,
  });

  const payMut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      const { data, error } = await supabase.functions.invoke("vendor-bill-pay", {
        body: {
          bill_id: bill.id,
          amount: amt,
          payment_method: method,
          wallet_id: method === "wallet" ? walletId : null,
          rail_reference: reference || null,
          rail_payload: extraField ? { destination: extraField } : null,
          notes: notes || null,
        },
      });

      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try { if (ctx?.json) msg = (await ctx.json())?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      qc.invalidateQueries({ queryKey: ["bill-payments", bill?.id] });
      if (data?.requires_approval) {
        toast.success("Payment requires approval (≥ $1,000) — sent to checker queue");
      } else {
        toast.success(data?.fully_paid ? "Bill fully paid" : "Partial payment recorded");
      }
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!bill) return null;

  return (
    <Dialog open={!!bill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Pay Bill {bill.bill_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-sm flex justify-between bg-muted/30 p-3 rounded">
            <span>Outstanding</span>
            <span className="font-mono font-bold">{bill.currency_code} {outstanding.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={outstanding.toFixed(2)} />
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wallet">Wallet (instant)</SelectItem>
                <SelectItem value="interac">Interac e-Transfer</SelectItem>
                <SelectItem value="eft">EFT (Canada)</SelectItem>
                <SelectItem value="cpn">Circle CPN (cross-border USDC)</SelectItem>
                <SelectItem value="pawapay">PawaPay (Mobile money — Africa)</SelectItem>
                <SelectItem value="mpesa">M-Pesa B2B</SelectItem>
                <SelectItem value="flutterwave">Flutterwave (Africa rails)</SelectItem>
                <SelectItem value="card">Credit / Debit card (Adyen)</SelectItem>
                <SelectItem value="saved_card">Card on file</SelectItem>
                <SelectItem value="stellar">Stellar / USDC</SelectItem>
                <SelectItem value="wire">Bank wire (SWIFT)</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="link">Payment Link to vendor</SelectItem>
                <SelectItem value="manual">Manual / Already paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method === "wallet" && (
            <div className="space-y-2">
              <Label>Pay from wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(method === "mpesa" || method === "pawapay") && (
            <div className="space-y-2">
              <Label>Mobile number</Label>
              <Input value={extraField} onChange={(e) => setExtraField(e.target.value)} placeholder="+254712345678" />
            </div>
          )}
          {method === "stellar" && (
            <div className="space-y-2">
              <Label>Stellar address</Label>
              <Input value={extraField} onChange={(e) => setExtraField(e.target.value)} placeholder="G... or muxed M..." />
            </div>
          )}
          {method === "wire" && (
            <div className="space-y-2">
              <Label>SWIFT / IBAN</Label>
              <Input value={extraField} onChange={(e) => setExtraField(e.target.value)} placeholder="SWIFT code + account" />
            </div>
          )}
          {method === "cheque" && (
            <div className="space-y-2">
              <Label>Cheque number</Label>
              <Input value={extraField} onChange={(e) => setExtraField(e.target.value)} />
            </div>
          )}
          {method !== "wallet" && method !== "manual" && method !== "cash" && (
            <div className="space-y-2">
              <Label>Reference / Tracking #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {payments.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Previous payments</Label>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between bg-muted/20 p-1.5 rounded">
                    <span>{p.payment_method} · {p.status}</span>
                    <span className="font-mono">{p.currency_code} {Number(p.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => payMut.mutate()} disabled={payMut.isPending || (method === "wallet" && !walletId)}>
              {payMut.isPending ? "Processing…" : "Pay"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
