import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useTreasury, type TreasuryFA } from "@/hooks/useTreasury";

export function OutboundTransferDialog({ fa, onOpenChange }: { fa: TreasuryFA; onOpenChange: (o: boolean) => void }) {
  const { outbound } = useTreasury();
  const [pm, setPm] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState<"ach" | "us_domestic_wire">("ach");
  const [desc, setDesc] = useState("");

  async function submit() {
    try {
      await outbound.mutateAsync({
        fa_id: fa.id,
        destination_payment_method: pm.trim(),
        amount: Number(amount),
        network,
        description: desc || undefined,
      });
      toast({ title: "Outbound transfer initiated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Outbound transfer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Destination payment method ID</Label>
            <Input value={pm} onChange={e => setPm(e.target.value)} placeholder="pm_..." />
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
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
          <div>
            <Label>Description (optional)</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={outbound.isPending || !pm || !amount}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
