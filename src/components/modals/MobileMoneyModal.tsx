import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, LoaderCircle, Smartphone } from "lucide-react";
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

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: Record<string, unknown>) => { close: () => void };
  }
}

const FLW_SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";
const EMBED_CONTAINER_ID = "flw-inline-checkout";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const c = error as { message?: string; error_description?: string; details?: string; hint?: string };
    return c.message || c.error_description || c.details || c.hint || fallback;
  }
  return fallback;
};

const loadFlutterwaveScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.FlutterwaveCheckout) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FLW_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Flutterwave")));
      return;
    }
    const script = document.createElement("script");
    script.src = FLW_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Flutterwave"));
    document.body.appendChild(script);
  });

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
  const [step, setStep] = useState<"details" | "checkout">("details");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [network, setNetwork] = useState(networks[0].value);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [transferId, setTransferId] = useState<string | null>(null);
  const checkoutInstanceRef = useRef<{ close: () => void } | null>(null);

  const { data: wallets } = useWallets();
  const { user } = useAuth();
  const createTransfer = useCreateTransfer();

  const wallet = wallets?.find((w) => w.wallet_id === walletId) || wallets?.[0];
  const net = networks.find((n) => n.value === network)!;
  const flutterwavePublicKey =
    import.meta.env.VITE_FLW_PUBLIC_KEY?.trim() ||
    "FLWPUBK_TEST-b6b1a9a088a3bae587f81e8faccffb26-X";

  const txRef = useMemo(
    () => (user && step === "checkout" ? `mm-${user.id.slice(0, 8)}-${Date.now()}` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  const resetForm = () => {
    setStep("details");
    setPhone("");
    setRecipientName("");
    setAmount("");
    setWalletId("");
    setTransferId(null);
  };

  const closeCheckout = () => {
    try {
      checkoutInstanceRef.current?.close();
    } catch {
      // ignore
    }
    checkoutInstanceRef.current = null;
  };

  const handleContinue = async () => {
    const result = schema.safeParse({ phone, amount: parseFloat(amount), recipientName });
    if (!result.success) return toast.error(result.error.issues[0].message);
    if (!wallet) return toast.error("Select a source wallet");
    if (Number(wallet.balance) <= 0)
      return toast.error(`Insufficient ${wallet.currency_code} wallet balance. Please deposit funds first.`);
    if (Number(wallet.balance) < result.data.amount)
      return toast.error(`Insufficient wallet balance. Available: ${wallet.symbol}${Number(wallet.balance).toLocaleString()}`);
    if (!user) return toast.error("Please sign in to continue");
    if (!flutterwavePublicKey) return toast.error("Flutterwave public key is missing");

    setIsLoading(true);
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
      setTransferId(transfer.id);
      setStep("checkout");
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to create transfer"));
    } finally {
      setIsLoading(false);
    }
  };

  // Mount inline checkout when entering checkout step
  useEffect(() => {
    if (step !== "checkout" || !user || !wallet || !transferId) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        await loadFlutterwaveScript();
        if (cancelled || !window.FlutterwaveCheckout) return;
        const container = document.getElementById(EMBED_CONTAINER_ID);
        if (container) container.innerHTML = "";

        const parsedAmount = parseFloat(amount);
        const instance = window.FlutterwaveCheckout({
          public_key: flutterwavePublicKey,
          tx_ref: txRef,
          amount: parsedAmount,
          currency: wallet.currency_code,
          payment_options: "mobilemoney,card",
          display: "inline",
          container: EMBED_CONTAINER_ID,
          customer: {
            email: user.email || `${user.id}@efin.money`,
            phone_number: phone.trim(),
            name: recipientName.trim(),
          },
          customizations: {
            title: "eFinMoney",
            description: `Mobile money to ${recipientName.trim()}`,
            logo: `${window.location.origin}/favicon.ico`,
          },
          meta: { network, wallet_id: wallet.wallet_id, transfer_id: transferId },
          callback: async (response: { status?: string; flw_ref?: string; transaction_id?: string | number }) => {
            try {
              const status = (response.status || "").toLowerCase();
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
              await supabase.from("transfers").update(updatePayload).eq("id", transferId).eq("sender_id", user.id);
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
                closeCheckout();
                setOpen(false);
                resetForm();
              } else {
                toast.error(response.status || "Transfer was not completed");
              }
            } catch (err) {
              toast.error(getErrorMessage(err, "Unable to update transfer"));
            }
          },
          onclose: () => {
            // user closed inline form — leave transfer in initiated state
          },
        });
        checkoutInstanceRef.current = instance;
      } catch (e) {
        toast.error(getErrorMessage(e, "Failed to load checkout"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      closeCheckout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, transferId]);

  const handleBack = async () => {
    closeCheckout();
    if (transferId && user) {
      try {
        await supabase
          .from("transfers")
          .update({ status: "failed", failure_reason: "User went back before paying" })
          .eq("id", transferId)
          .eq("sender_id", user.id)
          .eq("status", "initiated");
      } catch {
        // ignore
      }
    }
    setTransferId(null);
    setStep("details");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      closeCheckout();
      resetForm();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "checkout" && (
              <button
                type="button"
                onClick={handleBack}
                className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Smartphone className="w-5 h-5" />
            {step === "details" ? "Send Mobile Money" : "Complete Payment"}
          </DialogTitle>
        </DialogHeader>

        {step === "details" ? (
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
            <Button className="w-full" onClick={handleContinue} disabled={createTransfer.isPending || isLoading}>
              {createTransfer.isPending || isLoading ? (
                <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Preparing…</>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Paying <span className="text-foreground font-medium">{wallet?.symbol}{Number(amount || 0).toLocaleString()}</span> to {recipientName} ({phone})
            </div>
            <div className="relative h-[460px] rounded-lg border border-border overflow-hidden flw-embed-host" style={{ backgroundColor: "#0f172a" }}>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {/* Clipping window: hides Flutterwave's test-mode banner + header by shifting the iframe up */}
              <div className="absolute inset-0 overflow-hidden">
                <div id={EMBED_CONTAINER_ID} className="flw-embed-shift" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Secured by Flutterwave</p>
            <style>{`
              .flw-embed-host .flw-embed-shift { margin-top: -150px; height: 720px; }
              .flw-embed-host iframe {
                width: 100% !important;
                height: 720px !important;
                background: #0f172a !important;
                border: 0 !important;
              }
            `}</style>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
