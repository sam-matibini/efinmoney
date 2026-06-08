import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useTreasury, type TreasuryFA } from "@/hooks/useTreasury";

export function OutboundPaymentDialog({ fa, onOpenChange }: { fa: TreasuryFA; onOpenChange: (o: boolean) => void }) {
  const { outboundPayment } = useTreasury();
  const [payee, setPayee] = useState("");
  const [routing, setRouting] = useState("");
  const [acct, setAcct] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState<"ach" | "us_domestic_wire">("ach");
  const [holderType, setHolderType] = useState<"individual" | "company">("individual");
  const [desc, setDesc] = useState("");

  async function submit() {
    try {
      await outboundPayment.mutateAsync({
        fa_id: fa.id,
        amount: Number(amount),
        payee_name: payee,
        routing_number: routing.trim(),
        account_number: acct.trim(),
        account_holder_type: holderType,
        network,
        description: desc || undefined,
      });
      toast({ title: "Payment initiated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay third-party (US bank)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payee name</Label>
            <Input value={payee} onChange={e => setPayee(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Routing #</Label>
              <Input value={routing} onChange={e => setRouting(e.target.value)} maxLength={9} />
            </div>
            <div>
              <Label>Account #</Label>
              <Input value={acct} onChange={e => setAcct(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Holder type</Label>
              <Select value={holderType} onValueChange={v => setHolderType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Network</Label>
              <Select value={network} onValueChange={v => setNetwork(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="us_domestic_wire">US Domestic Wire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Memo (optional)</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={outboundPayment.isPending || !payee || !routing || !acct || !amount}>Send payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
