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
import { CurrencyFlag } from "@/components/ui/FlagImage";


interface SavingsModalProps {
  children: React.ReactNode;
}

const GoalRow = ({ goal }: { goal: SavingsGoal }) => {
  const [adding, setAdding] = useState(false);
  const [amt, setAmt] = useState('');
  const contribute = useContributeToGoal();
  const del = useDeleteSavingsGoal();
  const pct = Math.min(100, (Number(goal.current_amount) / Number(goal.target_amount)) * 100);

  const handleAdd = async () => {
    const n = parseFloat(amt);
    if (!n || n <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await contribute.mutateAsync({ goal, amount: n });
      toast.success(`Added ${goal.currency_code} ${n.toLocaleString()}`);
      setAmt(''); setAdding(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete goal "${goal.name}"?`)) return;
    try {
      await del.mutateAsync(goal.id);
      toast.success('Goal deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="p-3 rounded-lg bg-muted/40 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{goal.name}</span>
        <span className="text-muted-foreground text-xs">
          {goal.currency_code} {Number(goal.current_amount).toLocaleString()} / {Number(goal.target_amount).toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {adding ? (
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Amount"
            value={amt}
            onChange={e => setAmt(e.target.value)}
            className="h-8"
            autoFocus
          />
          <Button size="sm" onClick={handleAdd} disabled={contribute.isPending}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAmt(''); }}>Cancel</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add funds
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={handleDelete} disabled={del.isPending}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};

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
                    <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}</span>
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
