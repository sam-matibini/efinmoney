import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ArrowRightLeft, CheckCircle } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWallets } from '@/hooks/useWallets';
import { useFxRates } from '@/hooks/useFxRates';
import { useWalletTransfer } from '@/hooks/useWalletTransfer';
import { computeTransferQuote } from '@/lib/walletTransfer';
import { CurrencyFlag } from '@/components/ui/FlagImage';
import { toast } from 'sonner';

type Props = {
  children: React.ReactNode;
  defaultFromWalletId?: string;
};

const parseAmt = (v: string) => {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function WalletTransferModal({ children, defaultFromWalletId }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: wallets = [] } = useWallets();
  const { data: fxRates = [] } = useFxRates();
  const transfer = useWalletTransfer();

  const activeWallets = wallets.filter((w) => w.status === 'active');

  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setAmount('');
    const list = wallets.filter((w) => w.status === 'active');
    if (defaultFromWalletId && list.some((w) => w.wallet_id === defaultFromWalletId)) {
      setFromWalletId(defaultFromWalletId);
      setToWalletId(list.find((w) => w.wallet_id !== defaultFromWalletId)?.wallet_id ?? '');
    } else if (list.length >= 2) {
      setFromWalletId(list[0].wallet_id);
      setToWalletId(list[1].wallet_id);
    }
  }, [open, defaultFromWalletId, wallets]);

  const fromWallet = activeWallets.find((w) => w.wallet_id === fromWalletId);
  const toWallet = activeWallets.find((w) => w.wallet_id === toWalletId);

  const parsedAmount = parseAmt(amount);
  const quote = useMemo(
    () =>
      fromWallet && toWallet
        ? computeTransferQuote(parsedAmount, fromWallet.currency_code, toWallet.currency_code, fxRates)
        : { fee: 0, receive: 0, effective_rate: null, fee_rate: 0 },
    [parsedAmount, fromWallet, toWallet, fxRates],
  );

  const sameCurrency = fromWallet?.currency_code === toWallet?.currency_code;
  const canTransfer = activeWallets.length >= 2;

  const isValid =
    !!fromWallet &&
    !!toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    parsedAmount > 0 &&
    parsedAmount <= Number(fromWallet.balance) &&
    quote.effective_rate != null;

  const handleSwap = () => {
    setFromWalletId(toWalletId);
    setToWalletId(fromWalletId);
  };

  const handleSubmit = async () => {
    if (!fromWallet || !toWallet || !isValid) return;
    try {
      await transfer.mutateAsync({
        from_wallet_id: fromWallet.wallet_id,
        to_wallet_id: toWallet.wallet_id,
        from_currency: fromWallet.currency_code,
        to_currency: toWallet.currency_code,
        from_amount: parsedAmount,
      });
      setSuccess(true);
      toast.success('Transfer completed');
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 2500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Transfer between wallets
          </DialogTitle>
        </DialogHeader>

        {!canTransfer ? (
          <p className="text-sm text-muted-foreground py-4">
            You need at least two active wallets to transfer. Add another currency wallet first.
          </p>
        ) : success ? (
          <div className="py-10 text-center">
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
            <p className="font-semibold">Transfer complete</p>
            <p className="text-sm text-muted-foreground mt-2">
              {fromWallet?.symbol}
              {parsedAmount.toLocaleString()} {fromWallet?.currency_code} → {toWallet?.symbol}
              {quote.receive.toFixed(2)} {toWallet?.currency_code}
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>From</Label>
              <Select value={fromWalletId} onValueChange={setFromWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {activeWallets
                    .filter((w) => w.wallet_id !== toWalletId)
                    .map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        <span className="flex items-center gap-2">
                          <CurrencyFlag code={w.currency_code} size="w-4 h-4" />
                          {w.currency_code} · {w.symbol}
                          {Number(w.balance).toLocaleString()}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-center">
              <Button type="button" variant="outline" size="icon" onClick={handleSwap} className="rounded-full">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label>To</Label>
              <Select value={toWalletId} onValueChange={setToWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {activeWallets
                    .filter((w) => w.wallet_id !== fromWalletId)
                    .map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        <span className="flex items-center gap-2">
                          <CurrencyFlag code={w.currency_code} size="w-4 h-4" />
                          {w.currency_code} · {w.symbol}
                          {Number(w.balance).toLocaleString()}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount ({fromWallet?.currency_code ?? '—'})</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {fromWallet ? (
                <p className="text-xs text-muted-foreground">
                  Available: {fromWallet.symbol}
                  {Number(fromWallet.balance).toLocaleString()}
                </p>
              ) : null}
            </div>

            {parsedAmount > 0 && quote.effective_rate != null && toWallet ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
                {!sameCurrency && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate</span>
                    <span>
                      1 {fromWallet?.currency_code} = {quote.effective_rate.toFixed(4)} {toWallet.currency_code}
                    </span>
                  </div>
                )}
                {quote.fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee (0.5%)</span>
                    <span>
                      {fromWallet?.symbol}
                      {quote.fee.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-1 border-t">
                  <span>You receive</span>
                  <span className="text-primary">
                    {toWallet.symbol}
                    {quote.receive.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : parsedAmount > 0 && quote.effective_rate == null ? (
              <p className="text-sm text-destructive">No exchange rate for this pair.</p>
            ) : null}

            <Button className="w-full" disabled={!isValid || transfer.isPending} onClick={handleSubmit}>
              {transfer.isPending ? <LoadingSpinner size={18} /> : 'Transfer now'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
