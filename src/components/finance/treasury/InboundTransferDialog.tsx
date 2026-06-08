import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useTreasury, type TreasuryFA } from "@/hooks/useTreasury";

export function InboundTransferDialog({ fa, onOpenChange }: { fa: TreasuryFA; onOpenChange: (o: boolean) => void }) {
  const { inbound } = useTreasury();
  const [pm, setPm] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");

  async function submit() {
    try {
      await inbound.mutateAsync({
        fa_id: fa.id,
        origin_payment_method: pm.trim(),
        amount: Number(amount),
        description: desc || undefined,
      });
      toast({ title: "Inbound transfer initiated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inbound ACH transfer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>External bank payment method ID</Label>
            <Input value={pm} onChange={e => setPm(e.target.value)} placeholder="pm_..." />
            <p className="text-xs text-muted-foreground mt-1">Stripe us_bank_account payment method linked to your FA.</p>
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={inbound.isPending || !pm || !amount}>Initiate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
