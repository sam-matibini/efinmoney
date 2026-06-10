import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, CheckCircle2, AlertCircle, ArrowRight, User } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { fetchFxRate } from "@/lib/flutterwave";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import AnimatedCheck from "@/components/ui/AnimatedCheck";

interface Recipient {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  email: string | null;
  avatar_url: string | null;
  account_number?: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const EfinmoneyP2PFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [recipientCurrency, setRecipientCurrency] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<null | { id: string; target_amount: number; target_currency: string }>(null);

  const sender = wallets?.find((w) => w.wallet_id === selectedWalletId) || wallets?.[0];
  useEffect(() => {
    if (!selectedWalletId && sender) setSelectedWalletId(sender.wallet_id);
  }, [sender, selectedWalletId]);

  // Default recipient currency to sender currency once recipient is loaded
  useEffect(() => {
    if (recipient && sender && !recipientCurrency) setRecipientCurrency(sender.currency_code);
  }, [recipient, sender, recipientCurrency]);

  // Recipient available currencies (use common fiats as suggestions; backend will auto-create wallet)
  const currencyOptions = useMemo(() => {
    const codes = new Set<string>();
    wallets?.forEach((w) => codes.add(w.currency_code));
    ["USD", "CAD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "ZMW", "UGX", "TZS", "RWF", "MWK", "XAF", "XOF"].forEach((c) => codes.add(c));
    if (sender) codes.add(sender.currency_code);
    return Array.from(codes);
  }, [wallets, sender]);

  const fromCurrency = sender?.currency_code || "USD";
  const isSameCurrency = fromCurrency === recipientCurrency;
  const fxRow = fxRates?.find((r) => r.from_currency === fromCurrency && r.to_currency === recipientCurrency);
  const { data: derivedRate } = useQuery({
    queryKey: ["efm-p2p-fx", fromCurrency, recipientCurrency],
    queryFn: () => fetchFxRate(fromCurrency, recipientCurrency),
    enabled: !!recipient && !isSameCurrency && !fxRow && !!fromCurrency && !!recipientCurrency,
    staleTime: 60_000,
  });
  const effectiveRate = isSameCurrency
    ? 1
    : fxRow
    ? Number(fxRow.effective_rate)
    : Number(derivedRate || 0);
  const rateOk = isSameCurrency || effectiveRate > 0;

  const parsedAmount = parseFloat(amount) || 0;
  const targetAmount = parsedAmount * (rateOk ? effectiveRate : 0);
  const insufficient = sender && parsedAmount > Number(sender.balance);

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 3) {
      toast.error("Enter an email or @tag (min 3 chars)");
      return;
    }
    setSearching(true);
    setNotFound(false);
    setRecipient(null);
    try {
      const { data, error } = await supabase.rpc("lookup_efin_recipient" as any, { p_query: q });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row) {
        setNotFound(true);
      } else if (row.user_id === user?.id) {
        toast.error("That's you!");
      } else {
        setRecipient(row as Recipient);
      }
    } catch (e: any) {
      toast.error(e?.message || "Lookup failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async () => {
    if (!recipient || !sender || parsedAmount <= 0) return;
    if (insufficient) {
      toast.error("Insufficient balance");
      return;
    }
    if (!rateOk) {
      toast.error("No exchange rate available");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("internal-transfer", {
        body: {
          sender_wallet_id: sender.wallet_id,
          recipient_user_id: recipient.user_id,
          amount: parsedAmount,
          recipient_currency: recipientCurrency,
          note,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = data as any;
      setDone({ id: r.transfer_id, target_amount: r.target_amount, target_currency: r.target_currency });
      toast.success("Sent!");
    } catch (e: any) {
      toast.error(e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setQuery(""); setRecipient(null); setNotFound(false);
    setAmount(""); setNote(""); setDone(null);
  };

  if (done) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center space-y-4">
          <AnimatedCheck />
          <h2 className="text-2xl font-display font-bold text-foreground">Transfer complete</h2>
          <p className="text-muted-foreground">
            Sent {fmt(done.target_amount)} {done.target_currency} to{" "}
            {recipient?.full_name || `@${recipient?.efin_tag}` || recipient?.email}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={reset}>Send another</Button>
            <Button onClick={() => navigate(`/transfers/${done.id}`)}>View transfer</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: find recipient */}
      <Card className="border-border bg-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label className="text-sm">Send to eFinMoney user</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Instant, free, in-network. Search by email, @tag, or account number.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="email@example.com, @username, or 10-digit account #"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setRecipient(null); setNotFound(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching || query.trim().length < 3}>
              {searching ? <LoadingSpinner size={16} /> : "Find"}
            </Button>
          </div>

          {notFound && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>No eFinMoney user found for "{query}".</AlertDescription>
            </Alert>
          )}

          {recipient && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                {recipient.avatar_url
                  ? <img src={recipient.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : <User className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {recipient.full_name || recipient.email}
                </p>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {recipient.efin_tag && <span>@{recipient.efin_tag}</span>}
                  {recipient.account_number && <span>Acct: {recipient.account_number}</span>}
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: amount */}
      {recipient && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border bg-card">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">From your wallet</Label>
                  <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {wallets?.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          {w.flag_emoji} {w.currency_code} — {w.symbol}{fmt(Number(w.balance))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Recipient gets</Label>
                  <Select value={recipientCurrency} onValueChange={setRecipientCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Amount ({fromCurrency})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-2xl font-display h-14"
                />
                <p className="text-xs text-muted-foreground">
                  Available: {sender?.symbol}{fmt(Number(sender?.balance || 0))}
                </p>
              </div>

              {parsedAmount > 0 && rateOk && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                  <span className="text-sm text-muted-foreground">Recipient receives</span>
                  <span className="text-lg font-display font-bold text-foreground">
                    {fmt(targetAmount)} {recipientCurrency}
                  </span>
                </div>
              )}
              {!isSameCurrency && rateOk && parsedAmount > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                  Rate: 1 {fromCurrency} = {fmt(effectiveRate)} {recipientCurrency}
                </p>
              )}
              {!rateOk && !isSameCurrency && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>FX rate {fromCurrency}→{recipientCurrency} unavailable.</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                <Input
                  placeholder="What's this for?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={280}
                />
              </div>

              {insufficient && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>Insufficient balance in this wallet.</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSend}
                disabled={sending || !rateOk || parsedAmount <= 0 || !!insufficient}
                className="w-full h-12 gradient-primary text-primary-foreground font-medium"
              >
                {sending ? (
                  <LoadingSpinner size={16} />
                ) : (
                  <>Send {fmt(parsedAmount)} {fromCurrency} <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                No fees. Delivered instantly to their eFinMoney wallet.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default EfinmoneyP2PFlow;
