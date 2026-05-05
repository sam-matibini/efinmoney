import { useState } from "react";
import { z } from "zod";
import { PiggyBank, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateSavingsGoal, useSavingsGoals, useContributeToGoal, useDeleteSavingsGoal, type SavingsGoal } from "@/hooks/useSavingsGoals";
import { toast } from "sonner";

interface SavingsModalProps {
  children: React.ReactNode;
}

const schema = z.object({
  name: z.string().trim().min(1, 'Goal name is required').max(100),
  target_amount: z.number().positive('Target must be greater than 0').max(1e9, 'Target too large'),
  target_date: z.string().optional(),
});

const SavingsModal = ({ children }: SavingsModalProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [walletId, setWalletId] = useState<string>('');

  const { data: wallets } = useWallets();
  const { data: goals } = useSavingsGoals();
  const createGoal = useCreateSavingsGoal();
  const wallet = wallets?.find(w => w.wallet_id === walletId) || wallets?.[0];

  const handleSubmit = async () => {
    const result = schema.safeParse({
      name,
      target_amount: parseFloat(target),
      target_date: date || undefined,
    });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    try {
      await createGoal.mutateAsync({
        name: result.data.name,
        target_amount: result.data.target_amount,
        currency_code: wallet?.currency_code || 'USD',
        source_wallet_id: wallet?.wallet_id || null,
        target_date: result.data.target_date || null,
      });
      toast.success('Savings goal created');
      setOpen(false);
      setName(''); setTarget(''); setDate('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create goal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="w-5 h-5" /> Create Savings Goal
          </DialogTitle>
        </DialogHeader>

        {goals && goals.filter(g => g.status === 'active').length > 0 && (
          <div className="space-y-2 mb-2 max-h-64 overflow-y-auto">
            <p className="text-xs text-muted-foreground">Your active goals</p>
            {goals.filter(g => g.status === 'active').map(g => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="sav-name">Goal name</Label>
            <Input id="sav-name" placeholder="e.g. Emergency Fund" value={name} onChange={e => setName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="sav-target">Target amount ({wallet?.currency_code || 'USD'})</Label>
            <Input id="sav-target" type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sav-date">Target date (optional)</Label>
            <Input id="sav-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sav-wallet">Source wallet</Label>
            <Select value={walletId || wallet?.wallet_id || ''} onValueChange={setWalletId}>
              <SelectTrigger id="sav-wallet"><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {(wallets || []).map(w => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={createGoal.isPending}>
            {createGoal.isPending ? 'Creating…' : 'Create Goal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SavingsModal;
