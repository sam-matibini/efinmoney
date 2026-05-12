import { useState } from "react";
import { Copy, Check, Building2, Landmark, CreditCard, Globe, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import CardPaymentForm from "./CardPaymentForm";
import { initializeFlwPayment, cardChargeCurrency, friendlyFlwError, validateMinAmount } from "@/lib/flutterwave";

interface DepositModalProps { children: React.ReactNode; }

const DepositModal = ({ children }: DepositModalProps) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: wallets, isLoading } = useWallets();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  const selectedWallet = wallets?.find(w => w.wallet_id === selectedWalletId) || wallets?.[0];

  const reference = selectedWallet ? `EFM-${selectedWallet.wallet_id.slice(0, 8).toUpperCase()}` : '';
  const accountName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account Holder';
  const bankName = selectedWallet?.currency_code === 'CAD' ? 'TD Bank (Trust)' : 'Wise (Trust)';
  const accountNumber = selectedWallet ? `**** **** ${selectedWallet.wallet_id.slice(-4).toUpperCase()}` : '';
  const swift = selectedWallet?.currency_code === 'CAD' ? 'TDOMCATTTOR' : 'TRWIBEB1XXX';

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 1500);
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => copy(label, value)} aria-label={`Copy ${label}`}>
        {copied === label ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Deposit Funds</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto -mx-6 px-6 flex-1">

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-16" /></div>
        ) : !wallets || wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallets available. Create one first.</p>
        ) : (
          <Tabs defaultValue="bank" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="bank"><Landmark className="w-4 h-4 mr-1.5" /> Bank</TabsTrigger>
              <TabsTrigger value="card"><CreditCard className="w-4 h-4 mr-1.5" /> Card</TabsTrigger>
              <TabsTrigger value="flw"><Globe className="w-4 h-4 mr-1.5" /> Intl.</TabsTrigger>
            </TabsList>

            <TabsContent value="bank" className="space-y-4 mt-4">
              <div>
                <Label className="text-xs">Deposit into wallet</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {wallets.slice(0, 4).map((w) => (
                    <button
                      key={w.wallet_id}
                      onClick={() => setSelectedWalletId(w.wallet_id)}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        (selectedWalletId || wallets[0].wallet_id) === w.wallet_id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <p className="text-xs text-muted-foreground">{w.flag_emoji} {w.currency_code}</p>
                      <p className="text-sm font-medium truncate">{w.symbol}{Number(w.balance).toLocaleString()}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-xs text-foreground flex items-start gap-2">
                  <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Send a wire/EFT transfer to the details below. Include the <strong>reference</strong> so we can credit your wallet automatically.
                </p>
              </div>

              <div className="space-y-2">
                <Row label="Account Name" value={accountName} />
                <Row label="Bank Name" value={bankName} />
                <Row label="Account Number" value={accountNumber} />
                <Row label="SWIFT / BIC" value={swift} />
                <Row label="Reference (required)" value={reference} />
              </div>

              <p className="text-xs text-muted-foreground">Funds typically arrive within 1–3 business days.</p>
            </TabsContent>

            <TabsContent value="card" className="mt-4">
              <CardPaymentForm
                defaultWalletId={selectedWallet?.wallet_id}
                onSuccess={() => { /* form shows its own success state */ }}
              />
            </TabsContent>

            <TabsContent value="flw" className="mt-4">
              <FlutterwaveDepositForm walletCurrency={selectedWallet?.currency_code ?? "USD"} />
            </TabsContent>
          </Tabs>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepositModal;
