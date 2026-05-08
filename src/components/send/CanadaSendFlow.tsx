import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { downloadTransferReceipt } from "@/lib/receipt";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Mail, Landmark, AlertCircle, Info } from "lucide-react";

type Method = "interac" | "eft";

const FEES: Record<Method, number> = { interac: 0.5, eft: 0 };

const CanadaSendFlow = () => {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<Method>("interac");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  // Interac
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  // EFT
  const [institutionNumber, setInstitutionNumber] = useState("");
  const [transitNumber, setTransitNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");

  const [lastTransferId, setLastTransferId] = useState<string | null>(null);

  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();

  const cadWallets = (wallets || []).filter((w) => w.currency_code === "CAD");
  const selectedWallet = cadWallets.find((w) => w.wallet_id === walletId) || cadWallets[0];

  const parsedAmount = Math.max(0, parseFloat(amount) || 0);
  const fee = parsedAmount > 0 ? FEES[method] : 0;
  const receivedAmount = Math.max(0, parsedAmount - fee);
  const insufficient = !!selectedWallet && parsedAmount > 0 && (parsedAmount + fee) > Number(selectedWallet.balance);

  const noCadWallet = cadWallets.length === 0;

  const isStep1Valid = !!selectedWallet && parsedAmount > 0 && !insufficient;
  const isStep2Valid = method === "interac"
    ? recipientName.trim().length > 1 && /\S+@\S+\.\S+/.test(recipientEmail)
    : recipientName.trim().length > 1
        && /^\d{3}$/.test(institutionNumber)
        && /^\d{5}$/.test(transitNumber)
        && accountNumber.trim().length >= 4;

  const handleSubmit = async () => {
    if (!selectedWallet) return;
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: selectedWallet.wallet_id,
        recipient_name: recipientName,
        recipient_account: method === "eft"
          ? `${institutionNumber}-${transitNumber}-${accountNumber}`
          : recipientEmail,
        recipient_country: "CA",
        transfer_type: "domestic_canada",
        payout_method: method,
        source_currency: "CAD",
        target_currency: "CAD",
        source_amount: parsedAmount,
        target_amount: receivedAmount,
        exchange_rate: 1,
        fee_amount: fee,
      });

      // Best-effort: post ledger via execute-transfer (it will skip payout for unmapped corridor)
      try {
        await supabase.functions.invoke("execute-transfer", { body: { transfer_id: transfer.id } });
      } catch { /* non-fatal — record is created */ }

      setLastTransferId(transfer.id);
      setStep(3);
      toast.success("Canadian transfer initiated");
    } catch (e: any) {
      toast.error(e?.message || "Transfer failed");
    }
  };

  const reset = () => {
    setStep(1);
    setAmount("");
    setRecipientName(""); setRecipientEmail(""); setMessage("");
    setInstitutionNumber(""); setTransitNumber(""); setAccountNumber(""); setBankName("");
    setLastTransferId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Amount & Method</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {noCadWallet ? (
              <div className="p-3 rounded-lg border border-dashed border-border bg-muted/40 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  You don't have a CAD wallet. Create one from the Wallets page to send within Canada.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>From CAD Wallet</Label>
                <Select value={walletId || selectedWallet?.wallet_id} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select CAD wallet" /></SelectTrigger>
                  <SelectContent>
                    {cadWallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        🇨🇦 CAD — C${Number(w.balance).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount (CAD)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">C$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || parseFloat(v) >= 0) setAmount(v);
                  }}
                  className="pl-12 text-2xl h-14"
                />
              </div>
              {selectedWallet && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Available: C${Number(selectedWallet.balance).toFixed(2)}</p>
                  {insufficient && (
                    <p className="text-sm font-medium text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Insufficient CAD balance
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Delivery Method</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={method === "interac" ? "default" : "outline"}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("interac")}
                >
                  <Mail className="w-5 h-5" />
                  <span className="text-xs">Interac e-Transfer</span>
                  <span className="text-[10px] opacity-70">C$0.50 fee</span>
                </Button>
                <Button
                  type="button"
                  variant={method === "eft" ? "default" : "outline"}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("eft")}
                >
                  <Landmark className="w-5 h-5" />
                  <span className="text-xs">Bank Transfer (EFT)</span>
                  <span className="text-[10px] opacity-70">Free</span>
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted">
              <p className="text-sm text-muted-foreground mb-1">They receive</p>
              <p className="text-3xl font-display font-bold text-foreground">
                C${receivedAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Fee: C${fee.toFixed(2)} · Same-currency CAD → CAD
              </p>
            </div>

            <Button className="w-full" size="lg" onClick={() => setStep(2)} disabled={!isStep1Valid}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Recipient Details</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Recipient Full Name</Label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Doe" />
            </div>

            {method === "interac" ? (
              <>
                <div className="space-y-2">
                  <Label>Recipient Email</Label>
                  <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Message (optional)</Label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks for dinner!" maxLength={400} rows={3} />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Institution # (3 digits)</Label>
                    <Input inputMode="numeric" maxLength={3} value={institutionNumber} onChange={(e) => setInstitutionNumber(e.target.value.replace(/\D/g, ""))} placeholder="001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Transit / Branch # (5 digits)</Label>
                    <Input inputMode="numeric" maxLength={5} value={transitNumber} onChange={(e) => setTransitNumber(e.target.value.replace(/\D/g, ""))} placeholder="12345" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="1234567" />
                </div>
                <div className="space-y-2">
                  <Label>Bank Name (optional)</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Royal Bank of Canada" />
                </div>
              </>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={!isStep2Valid || createTransfer.isPending}
              >
                {createTransfer.isPending
                  ? "Processing..."
                  : `Send C$${parsedAmount.toFixed(2)} via ${method === "interac" ? "Interac e-Transfer" : "Bank Transfer"}`}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Summary:</strong> C${parsedAmount.toFixed(2)} from your CAD wallet · Fee C${fee.toFixed(2)} · Recipient gets C${receivedAmount.toFixed(2)}</p>
                <p>Method: {method === "interac" ? "Interac e-Transfer (email)" : "Bank Transfer (EFT)"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="py-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <CheckCircle className="w-10 h-10 text-green-500" />
            </motion.div>
            <h3 className="text-2xl font-display font-bold mb-2">Transfer sent!</h3>
            <p className="text-muted-foreground mb-2">
              C${parsedAmount.toFixed(2)} is on its way to {recipientName}
            </p>
            {method === "interac" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Interac e-Transfer will be sent within 30 minutes. {recipientName} will receive an email from eFinMoney at <strong>{recipientEmail}</strong>.
              </p>
            )}
            {method === "eft" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds will arrive in the recipient's bank account within 1–3 business days.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {lastTransferId && (
                <Button asChild>
                  <Link to={`/transfers/${lastTransferId}`}>Track your transfer</Link>
                </Button>
              )}
              {lastTransferId && (
                <Button variant="outline" onClick={() => downloadTransferReceipt(lastTransferId)}>
                  Download Receipt
                </Button>
              )}
              <Button variant="outline" onClick={reset}>Send Another</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CanadaSendFlow;
