import { useState } from "react";
import { z } from "zod";
import { CreditCard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";


interface PayBillsModalProps {
  children: React.ReactNode;
}

const categories = [
  { value: 'utilities', label: 'Utilities (Power, Water)' },
  { value: 'internet', label: 'Internet' },
  { value: 'tv', label: 'TV / Streaming' },
  { value: 'airtime', label: 'Airtime / Data' },
];

const schema = z.object({
  provider: z.string().trim().min(1, 'Provider is required').max(100),
  account: z.string().trim().min(1, 'Account/meter number is required').max(50),
  amount: z.number().positive('Amount must be greater than 0').max(1_000_000, 'Amount too large'),
});

const PayBillsModal = ({ children }: PayBillsModalProps) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categories[0].value);
  const [provider, setProvider] = useState('');
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState<string>('');

  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();
  const wallet = wallets?.find(w => w.wallet_id === walletId) || wallets?.[0];

  const handleSubmit = async () => {
    const result = schema.safeParse({ provider, account, amount: parseFloat(amount) });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    if (!wallet) {
      toast.error('Select a source wallet');
      return;
    }
    try {
      await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: provider.trim(),
        recipient_account: account.trim(),
        recipient_country: 'BILL',
        transfer_type: 'bill_payment',
        payout_method: category,
        source_currency: wallet.currency_code,
        target_currency: wallet.currency_code,
        source_amount: result.data.amount,
        target_amount: result.data.amount,
        exchange_rate: 1,
        fee_amount: 0,
      });
      toast.success('Bill payment recorded');
      setOpen(false);
      setProvider(''); setAccount(''); setAmount('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Pay Bills
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bill-cat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="bill-cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bill-provider">Provider</Label>
            <Input id="bill-provider" placeholder="e.g. Kenya Power" value={provider} onChange={e => setProvider(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="bill-account">Account / Meter number</Label>
            <Input id="bill-account" value={account} onChange={e => setAccount(e.target.value)} maxLength={50} />
          </div>
          <div>
            <Label htmlFor="bill-wallet">Pay from</Label>
            <Select value={walletId || wallet?.wallet_id || ''} onValueChange={setWalletId}>
              <SelectTrigger id="bill-wallet"><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {(wallets || []).map(w => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}</span>
                  </SelectItem>

                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bill-amount">Amount ({wallet?.currency_code || ''})</Label>
            <Input id="bill-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={createTransfer.isPending}>
            {createTransfer.isPending ? 'Processing…' : 'Pay Bill'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PayBillsModal;
