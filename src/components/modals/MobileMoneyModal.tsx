import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { LoaderCircle, Smartphone } from "lucide-react";
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3";
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
import {
  MOBILE_MONEY_CURRENCY,
  fetchFxRate,
  friendlyFlwError,
  validateMinAmount,
} from "@/lib/flutterwave";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const c = error as { message?: string; error_description?: string; details?: string; hint?: string };
    return c.message || c.error_description || c.details || c.hint || fallback;
  }
  return fallback;
};

interface MobileMoneyModalProps {
  children: React.ReactNode;
}

const networks = [
  { value: "mpesa", label: "M-Pesa (Kenya)", country: "KE", currency: "KES" },
  { value: "mtn_mobile", label: "MTN Mobile Money (Uganda)", country: "UG", currency: "UGX" },
  { value: "airtel_money", label: "Airtel Money (Tanzania)", country: "TZ", currency: "TZS" },
];

const schema = z.object({
  phone: z.string().trim().min(7, "Phone number is too short").max(20, "Phone number is too long"),
  amount: z.number().positive("Amount must be greater than 0").max(1_000_000, "Amount is too large"),
  recipientName: z.string().trim().min(1, "Recipient name is required").max(100),
});

const MobileMoneyModal = ({ children }: MobileMoneyModalProps) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [network, setNetwork] = useState(networks[0].value);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: wallets } = useWallets();
  const { user } = useAuth();
  const createTransfer = useCreateTransfer();

  const wallet = wallets?.find((w) => w.wallet_id === walletId) || wallets?.[0];
  const net = networks.find((n) => n.value === network)!;
  const flutterwavePublicKey =
    import.meta.env.VITE_FLW_PUBLIC_KEY?.trim() ||
    "FLWPUBK_TEST-b6b1a9a088a3bae587f81e8faccffb26-X";

  const txRef = useMemo(
    () => (user ? `mm-${user.id.slice(0, 8)}-${Date.now()}` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  const parsedAmount = parseFloat(amount) || 0;

  const handleFlutterPayment = useFlutterwave({
    public_key: flutterwavePublicKey,
    tx_ref: txRef,
    amount: parsedAmount,
    currency: wallet?.currency_code || "USD",
    payment_options: "mobilemoney,card",
    customer: {
      email: user?.email || `${user?.id || "guest"}@efin.money`,
      phone_number: phone.trim(),
      name: recipientName.trim() || "eFinMoney user",
    },
    customizations: {
      title: "eFinMoney",
      description: `Mobile money to ${recipientName.trim() || "recipient"}`,
      logo: typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : "",
    },
    meta: { network, wallet_id: wallet?.wallet_id || "" },
  });

  const resetForm = () => {
    setPhone("");
    setRecipientName("");
    setAmount("");
    setWalletId("");
  };

  const handlePay = async () => {
    const result = schema.safeParse({ phone, amount: parsedAmount, recipientName });
    if (!result.success) return toast.error(result.error.issues[0].message);
    if (!wallet) return toast.error("Select a source wallet");
    if (Number(wallet.balance) <= 0)
      return toast.error(`Insufficient ${wallet.currency_code} wallet balance. Please deposit funds first.`);
    if (Number(wallet.balance) < result.data.amount)
      return toast.error(`Insufficient wallet balance. Available: ${wallet.symbol}${Number(wallet.balance).toLocaleString()}`);
    if (!user) return toast.error("Please sign in to continue");
    if (!flutterwavePublicKey) return toast.error("Flutterwave public key is missing");

    setIsLoading(true);
    let transferId: string | null = null;
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: recipientName.trim(),
        recipient_phone: phone.trim(),
        recipient_country: net.country,
        transfer_type: "mobile_money",
        payout_method: network,
        source_currency: wallet.currency_code,
        target_currency: wallet.currency_code,
        source_amount: result.data.amount,
        target_amount: result.data.amount,
        exchange_rate: 1,
        fee_amount: 0,
      });
      transferId = transfer.id;
    } catch (e) {
      setIsLoading(false);
      return toast.error(getErrorMessage(e, "Failed to create transfer"));
    }

    const tId = transferId!;
    handleFlutterPayment({
      callback: async (response) => {
        try {
          const status = String(response.status || "").toLowerCase();
          const success = ["successful", "completed", "success"].includes(status);
          const updatePayload = success
            ? {
                status: "completed" as const,
                provider_reference: response.flw_ref || String(response.transaction_id || txRef),
                failure_reason: null,
                completed_at: new Date().toISOString(),
              }
            : {
                status: "failed" as const,
                provider_reference: response.flw_ref || null,
                failure_reason: response.status || "Checkout failed",
              };
          await supabase.from("transfers").update(updatePayload).eq("id", tId).eq("sender_id", user.id);
          await supabase.from("notifications").insert({
            user_id: user.id,
            title: success ? "Transfer completed" : "Transfer failed",
            message: success
              ? `Your ${wallet.currency_code} ${parsedAmount} transfer to ${recipientName.trim()} is complete.`
              : response.status || "Flutterwave could not complete this transfer.",
            type: success ? "transfer" : "error",
          });
          if (success) {
            toast.success("Transfer completed");
            setOpen(false);
            resetForm();
          } else {
            toast.error(response.status || "Transfer was not completed");
          }
        } catch (err) {
          toast.error(getErrorMessage(err, "Unable to update transfer"));
        } finally {
          closePaymentModal();
          setIsLoading(false);
        }
      },
      onClose: async () => {
        try {
          await supabase
            .from("transfers")
            .update({ status: "failed", failure_reason: "User closed payment without paying" })
            .eq("id", tId)
            .eq("sender_id", user.id)
            .eq("status", "initiated");
        } catch {
          // ignore
        }
        setIsLoading(false);
      },
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Send Mobile Money
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="mm-network">Network</Label>
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger id="mm-network"><SelectValue /></SelectTrigger>
              <SelectContent>
                {networks.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mm-name">Recipient name</Label>
            <Input id="mm-name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="mm-phone">Phone number</Label>
            <Input id="mm-phone" type="tel" placeholder="+254 712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
          </div>
          <div>
            <Label htmlFor="mm-wallet">From wallet</Label>
            <Select value={walletId || wallet?.wallet_id || ""} onValueChange={setWalletId}>
              <SelectTrigger id="mm-wallet"><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {(wallets || []).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mm-amount">Amount ({wallet?.currency_code || ""})</Label>
            <Input id="mm-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handlePay} disabled={createTransfer.isPending || isLoading}>
            {createTransfer.isPending || isLoading ? (
              <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Preparing…</>
            ) : (
              "Pay with Flutterwave"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
