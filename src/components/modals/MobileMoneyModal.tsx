import { useMemo, useState } from "react";
import { z } from "zod";
import { LoaderCircle, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { closePaymentModal, useFlutterwave } from "flutterwave-react-v3";

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
  const [isLaunchingCheckout, setIsLaunchingCheckout] = useState(false);

  const { data: wallets } = useWallets();
  const { user } = useAuth();
  const createTransfer = useCreateTransfer();

  const wallet = wallets?.find(w => w.wallet_id === walletId) || wallets?.[0];
  const net = networks.find(n => n.value === network)!;
  const flutterwavePublicKey = import.meta.env.VITE_FLW_PUBLIC_KEY?.trim();

  const checkoutConfig = useMemo(() => {
    if (!flutterwavePublicKey || !wallet || !user) return null;

    const parsedAmount = Number.parseFloat(amount);
    const safeAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

    return {
      public_key: flutterwavePublicKey,
      tx_ref: `mm-${user.id.slice(0, 8)}-${Date.now()}`,
      amount: safeAmount,
      currency: wallet.currency_code,
      payment_options: 'mobilemoney',
      customer: {
        email: user.email || `${user.id}@efin.money`,
        phone_number: phone.trim(),
        name: recipientName.trim(),
      },
      customizations: {
        title: 'eFinMoney Mobile Money',
        description: `Fund a ${wallet.currency_code} mobile money transfer to ${recipientName.trim() || 'your recipient'}`,
        logo: `${window.location.origin}/favicon.ico`,
      },
      meta: {
        network,
        wallet_id: wallet.wallet_id,
      },
    };
  }, [amount, flutterwavePublicKey, network, phone, recipientName, user, wallet]);

  const handleFlutterPayment = useFlutterwave(checkoutConfig || {
    public_key: '',
    tx_ref: 'disabled',
    amount: 0,
    currency: 'USD',
    payment_options: 'mobilemoney',
    customer: { email: '', phone_number: '', name: '' },
    customizations: { title: 'eFinMoney Mobile Money', description: '', logo: '' },
  });

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
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }
    if (!flutterwavePublicKey) {
      toast.error('Flutterwave public key is missing');
      return;
    }
    if (!checkoutConfig) {
      toast.error('Unable to prepare checkout');
      return;
    }

    setIsLaunchingCheckout(true);

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

      handleFlutterPayment({
        callback: async (response) => {
          try {
            const status = (response.status || '').toLowerCase();
            const success = ['successful', 'completed', 'success'].includes(status);
            const updatePayload = success
              ? {
                  status: 'completed',
                  provider_reference: response.flw_ref || String(response.transaction_id || checkoutConfig.tx_ref),
                  failure_reason: null,
                  completed_at: new Date().toISOString(),
                }
              : {
                  status: 'failed',
                  provider_reference: response.flw_ref || null,
                  failure_reason: response.status || 'Checkout failed',
                };

            const { error: transferUpdateError } = await supabase
              .from('transfers')
              .update(updatePayload)
              .eq('id', transfer.id)
              .eq('sender_id', user.id);

            if (transferUpdateError) throw transferUpdateError;

            const notification = success
              ? {
                  user_id: user.id,
                  title: 'Transfer completed',
                  message: `Your ${wallet.currency_code} ${result.data.amount} mobile money transfer to ${recipientName.trim()} is complete.`,
                  type: 'transfer',
                }
              : {
                  user_id: user.id,
                  title: 'Transfer failed',
                  message: response.status || 'Flutterwave could not complete this transfer.',
                  type: 'error',
                };

            await supabase.from('notifications').insert(notification);

            if (success) {
              toast.success('Transfer completed successfully');
            } else {
              toast.error(response.status || 'Transfer was not completed');
            }
            closePaymentModal();

            if (success) {
              setOpen(false);
              setPhone('');
              setRecipientName('');
              setAmount('');
              setWalletId('');
            }
          } catch (callbackError: any) {
            console.error('Flutterwave callback error:', callbackError);
            toast.error(callbackError?.message || 'Unable to update transfer status');
          } finally {
            setIsLaunchingCheckout(false);
          }
        },
        onClose: async () => {
          try {
            closePaymentModal();
            const { data: latestTransfer } = await supabase
              .from('transfers')
              .select('status')
              .eq('id', transfer.id)
              .eq('sender_id', user.id)
              .single();

            if (!latestTransfer || latestTransfer.status === 'initiated') {
              await supabase
                .from('transfers')
                .update({
                  status: 'failed',
                  failure_reason: 'Checkout cancelled before completion',
                })
                .eq('id', transfer.id)
                .eq('sender_id', user.id);

              await supabase.from('notifications').insert({
                user_id: user.id,
                title: 'Transfer cancelled',
                message: `Your ${wallet.currency_code} ${result.data.amount} mobile money transfer to ${recipientName.trim()} was cancelled.`,
                type: 'error',
              });
            }
          } catch (closeError) {
            console.error('Flutterwave close handler error:', closeError);
            toast.error('Transfer checkout was closed before completion');
          } finally {
            setIsLaunchingCheckout(false);
          }
        },
      });
    } catch (e: any) {
      setIsLaunchingCheckout(false);
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
          <p className="text-xs text-muted-foreground">You’ll complete this mobile money payment in Flutterwave’s secure checkout. Supported networks are handled there directly.</p>
          <Button className="w-full" onClick={handleSubmit} disabled={createTransfer.isPending || isLaunchingCheckout}>
            {createTransfer.isPending || isLaunchingCheckout ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Opening checkout…</>) : 'Pay with Flutterwave'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
