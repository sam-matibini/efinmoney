import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Globe, ShieldCheck, Zap } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { getCpnQuote, initiateCpnPayout, listEnabledCorridors, type CpnQuote, type CpnCorridor } from "@/lib/circle";
import { toast } from "sonner";

const SendCpnPage = () => {
  const navigate = useNavigate();
  const { data: wallets } = useWallets();

  const [corridors, setCorridors] = useState<CpnCorridor[]>([]);
  const [loadingCorridors, setLoadingCorridors] = useState(true);
  const [walletId, setWalletId] = useState("");
  const [corridorId, setCorridorId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [quote, setQuote] = useState<CpnQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await listEnabledCorridors();
        setCorridors(list);
        if (list[0]) setCorridorId(list[0].id);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load corridors");
      } finally {
        setLoadingCorridors(false);
      }
    })();
  }, []);

  const selectedCorridor = corridors.find((c) => c.id === corridorId);
  const matchingWallets = useMemo(
    () => (wallets || []).filter((w) => !selectedCorridor || w.currency_code === selectedCorridor.source_currency),
    [wallets, selectedCorridor]
  );
  useEffect(() => {
    if (!walletId && matchingWallets[0]) setWalletId(matchingWallets[0].wallet_id);
  }, [matchingWallets, walletId]);

  const wallet = matchingWallets.find((w) => w.wallet_id === walletId);
  const parsedAmount = Math.max(0, parseFloat(amount) || 0);

  const canQuote = !!selectedCorridor && parsedAmount > 0
    && parsedAmount >= selectedCorridor.min_amount
    && parsedAmount <= selectedCorridor.max_amount;

  const getQuote = async () => {
    if (!selectedCorridor) return;
    setQuoting(true);
    setQuote(null);
    try {
      const q = await getCpnQuote({
        source_currency: selectedCorridor.source_currency,
        dest_country: selectedCorridor.dest_country,
        dest_currency: selectedCorridor.dest_currency,
        source_amount: parsedAmount,
        payout_method: "bank",
      });
      setQuote(q);
    } catch (e: any) {
      toast.error(e?.message || "Could not fetch quote");
    } finally {
      setQuoting(false);
    }
  };

  const submit = async () => {
    if (!quote || !wallet) return;
    if (!recipientName.trim() || !recipientAccount.trim()) {
      toast.error("Recipient name and account number are required");
      return;
    }
    if (parsedAmount > Number(wallet.balance)) {
      toast.error("Insufficient wallet balance");
      return;
    }
    setSubmitting(true);
    try {
      const res = await initiateCpnPayout({
        source_wallet_id: wallet.wallet_id,
        quote,
        recipient: {
          name: recipientName.trim(),
          account_number: recipientAccount.trim(),
          bank_code: bankCode.trim() || undefined,
          bank_name: bankName.trim() || undefined,
        },
      });
      toast.success("CPN payout initiated");
      if (res?.transfer_id) {
        navigate(`/transfers/${res.transfer_id}`);
      } else {
        navigate("/transfers");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not initiate payout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Header />
      <main className="container mx-auto px-4 py-6 lg:py-10 max-w-3xl">
        <BackToDashboard />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" /> Circle Payments Network
              </Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> USDC-settled
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Zap className="h-3 w-3" /> Fast settlement
              </Badge>
            </div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Send via CPN</h1>
            <p className="text-muted-foreground">
              Cross-border bank payout settled in USDC. Funds debit your wallet, route via Circle, and land in the recipient's local bank.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Corridor & amount</CardTitle>
              <CardDescription>
                {loadingCorridors
                  ? "Loading enabled corridors…"
                  : corridors.length === 0
                    ? "No CPN corridors are enabled yet. Ask an admin to enable one in Settings → Circle CPN."
                    : "Pick a destination and how much to send."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Destination</Label>
                  <Select value={corridorId} onValueChange={(v) => { setCorridorId(v); setQuote(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select corridor" /></SelectTrigger>
                    <SelectContent>
                      {corridors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.source_currency} → {c.dest_currency} ({c.dest_country})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From wallet</Label>
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {matchingWallets.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          {w.flag_emoji} {w.currency_code} · {w.symbol}{Number(w.balance).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Amount ({selectedCorridor?.source_currency || ""})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                  placeholder="0.00"
                />
                {selectedCorridor && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Limits {selectedCorridor.min_amount}–{selectedCorridor.max_amount} {selectedCorridor.source_currency} · ETA ~{selectedCorridor.est_minutes} min
                  </p>
                )}
              </div>

              <Button onClick={getQuote} disabled={!canQuote || quoting} variant="outline">
                {quoting ? <LoadingSpinner size={16} className="mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Get quote
              </Button>

              {quote && (
                <div className="rounded-lg border p-4 bg-muted/30 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 {quote.source_currency} = {quote.effective_rate.toFixed(4)} {quote.dest_currency}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span>{quote.platform_fee.toFixed(2)} {quote.source_currency}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Circle fee</span><span>{quote.circle_fee.toFixed(2)} {quote.source_currency}</span></div>
                  <div className="flex justify-between font-semibold pt-1 border-t mt-2">
                    <span>Recipient gets</span>
                    <span>{quote.dest_amount.toFixed(2)} {quote.dest_currency}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {quote && (
            <Card>
              <CardHeader>
                <CardTitle>Recipient bank details</CardTitle>
                <CardDescription>Enter the beneficiary's local bank account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Full name</Label>
                    <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Account number / IBAN</Label>
                    <Input value={recipientAccount} onChange={(e) => setRecipientAccount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Bank code / SWIFT (optional)</Label>
                    <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
                  </div>
                  <div>
                    <Label>Bank name (optional)</Label>
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  </div>
                </div>
                <Button onClick={submit} disabled={submitting} className="w-full">
                  {submitting ? <LoadingSpinner size={16} className="mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  Send {parsedAmount.toFixed(2)} {quote.source_currency}
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </main>
      <MobileNav />
    </div>
  );
};

export default SendCpnPage;
