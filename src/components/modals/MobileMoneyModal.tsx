import { useState } from "react";
import { z } from "zod";
import { Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MobileMoneyModalProps {
  children: React.ReactNode;
}

const networks = [
  { value: 'mpesa', label: 'M-Pesa (Kenya)', country: 'KE', currency: 'KES' },
  { value: 'mtn_mobile', label: 'MTN Mobile Money (Uganda)', country: 'UG', currency: 'UGX' },
  { value: 'airtel_money', label: 'Airtel Money (Tanzania)', country: 'TZ', currency: 'TZS' },
];

const schema = z.object({
  phone: z.string().trim().min(7, 'Phone number is too short').max(20, 'Phone number is too long'),
  amount: z.number().positive('Amount must be greater than 0').max(1_000_000, 'Amount is too large'),
  recipientName: z.string().trim().min(1, 'Recipient name is required').max(100),
});

const MobileMoneyModal = ({ children }: MobileMoneyModalProps) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [network, setNetwork] = useState(networks[0].value);
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState<string>('');

  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();

  const wallet = wallets?.find(w => w.wallet_id === walletId) || wallets?.[0];
  const net = networks.find(n => n.value === network)!;

  const handleSubmit = async () => {
    const result = schema.safeParse({
      phone,
      amount: parseFloat(amount),
      recipientName,
    });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    if (!wallet) {
      toast.error('Select a source wallet');
      return;
    }
    if (Number(wallet.balance) <= 0) {
      toast.error(`Insufficient ${wallet.currency_code} wallet balance. Please deposit funds first.`);
      return;
    }
    if (Number(wallet.balance) < result.data.amount) {
      toast.error(`Insufficient wallet balance. Available: ${wallet.symbol}${Number(wallet.balance).toLocaleString()}`);
      return;
    }
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: recipientName.trim(),
        recipient_phone: phone.trim(),
        recipient_country: net.country,
        transfer_type: 'mobile_money',
        payout_method: network,
        source_currency: wallet.currency_code,
        target_currency: wallet.currency_code,
        source_amount: result.data.amount,
        target_amount: result.data.amount,
        exchange_rate: 1,
        fee_amount: 0,
      });

      // Trigger Flutterwave payout for all networks
      const networkMap: Record<string, string> = {
        mpesa: 'mpesa', mtn_mobile: 'mtn', airtel_money: 'airtel',
      };
      const { data, error } = await supabase.functions.invoke('flutterwave-payout', {
        body: {
          transfer_id: transfer.id,
          phone_number: phone.trim(),
          amount: result.data.amount,
          currency: net.currency,
          network: networkMap[network] || 'mpesa',
          recipient_name: recipientName.trim(),
        },
      });
      if (error) throw error;
      if (data?.stub) {
        toast.success('Transfer queued (Flutterwave credentials pending)');
      } else if (data?.success) {
        toast.success('Mobile money payout initiated');
      } else {
        throw new Error(data?.error || 'Payout failed');
      }

      setOpen(false);
      setPhone(''); setRecipientName(''); setAmount('');
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.details || e?.hint || 'Failed to create transfer';
      console.error('Mobile money transfer error:', e);
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> Send Mobile Money
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="mm-network">Network</Label>
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger id="mm-network"><SelectValue /></SelectTrigger>
              <SelectContent>
                {networks.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mm-name">Recipient name</Label>
            <Input id="mm-name" value={recipientName} onChange={e => setRecipientName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="mm-phone">Phone number</Label>
            <Input id="mm-phone" type="tel" placeholder="+254 712 345 678" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} />
          </div>
          <div>
            <Label htmlFor="mm-wallet">From wallet</Label>
            <Select value={walletId || wallet?.wallet_id || ''} onValueChange={setWalletId}>
              <SelectTrigger id="mm-wallet"><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {(wallets || []).map(w => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mm-amount">Amount ({wallet?.currency_code || ''})</Label>
            <Input id="mm-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={createTransfer.isPending}>
            {createTransfer.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
