import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, AlertCircle, User, X, Plus, Send, RefreshCcw } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { fetchFxRate } from "@/lib/flutterwave";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import AnimatedCheck from "@/components/ui/AnimatedCheck";
import { usePinGate } from "@/components/send/usePinGate";
import { sortByPriority } from "@/lib/currencyPriority";

interface Recipient {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  email: string | null;
  avatar_url: string | null;
  account_number?: string | null;
}

interface RecipientEntry {
  recipient: Recipient;
  currency: string;
  note: string;
  status: "pending" | "sending" | "success" | "failed";
  error?: string;
  transferId?: string;
  targetAmount?: number;
  targetCurrency?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── RecipientCard sub-component ────────────────────────────────────────────

interface RecipientCardProps {
  entry: RecipientEntry;
  fromCurrency: string;
  currencies: string[];
  amountPerUser: number;
  sending: boolean;
  onUpdate: (userId: string, updates: Partial<RecipientEntry>) => void;
  onRemove: (userId: string) => void;
  onRetry: (userId: string) => void;
}

const RecipientCard: React.FC<RecipientCardProps> = ({
  entry,
  fromCurrency,
  currencies,
  amountPerUser,
  sending,
  onUpdate,
  onRemove,
  onRetry,
}) => {
  const { data: fxRates } = useFxRates();
  const { recipient, currency, note, status, error: entryError, targetAmount: txTarget, targetCurrency: txCurrency } = entry;

  const isSameCurrency = fromCurrency === currency;
  const fxRow = fxRates?.find(
    (r) => r.from_currency === fromCurrency && r.to_currency === currency,
  );
  const { data: derivedRate } = useQuery({
    queryKey: ["efm-p2p-fx", fromCurrency, currency],
    queryFn: () => fetchFxRate(fromCurrency, currency),
    enabled: !isSameCurrency && !fxRow && !!fromCurrency && !!currency,
    staleTime: 60_000,
  });
  const effectiveRate = isSameCurrency
    ? 1
    : fxRow
      ? Number(fxRow.effective_rate)
      : Number(derivedRate || 0);
  const rateOk = isSameCurrency || effectiveRate > 0;
  const targetDisplay = amountPerUser * (rateOk ? effectiveRate : 0);

  const canEdit = status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${
        status === "success"
          ? "border-green-500/40 bg-green-500/5"
          : status === "failed"
            ? "border-red-500/40 bg-red-500/5"
            : "border-border bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
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
        {status === "pending" && (
          <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={() => onRemove(recipient.user_id)}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Currency + FX */}
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs text-muted-foreground">Receives in</Label>
          <Select
            value={currency}
            onValueChange={(v) => onUpdate(recipient.user_id, { currency: v })}
            disabled={!canEdit}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-3 flex flex-col justify-end items-end">
          {amountPerUser > 0 && rateOk && (
            <>
              <span className="text-lg font-display font-bold text-foreground">
                {fmt(targetDisplay)} {currency}
              </span>
              {!isSameCurrency && (
                <p className="text-xs text-muted-foreground">
                  1 {fromCurrency} = {fmt(effectiveRate)} {currency}
                </p>
              )}
            </>
          )}
          {!rateOk && !isSameCurrency && (
            <p className="text-xs text-destructive">Rate unavailable</p>
          )}
        </div>
      </div>

      {/* Note */}
      <Input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => onUpdate(recipient.user_id, { note: e.target.value })}
        maxLength={280}
        disabled={!canEdit}
        className="h-9 text-sm"
      />

      {/* Status bar */}
      <div className="flex items-center justify-between min-h-[28px]">
        <div className="flex items-center gap-2 text-sm">
          {status === "sending" && (
            <>
              <LoadingSpinner size={14} />
              <span className="text-muted-foreground">Sending…</span>
            </>
          )}
          {status === "success" && txTarget !== undefined && (
            <span className="text-green-600 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Sent {fmt(txTarget)} {txCurrency || currency}
            </span>
          )}
          {status === "failed" && (
            <span className="text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[200px]">{entryError || "Transfer failed"}</span>
            </span>
          )}
          {status === "pending" && (
            <span className="text-muted-foreground">Ready</span>
          )}
        </div>
        {status === "failed" && !sending && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => onRetry(recipient.user_id)}>
            <RefreshCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        )}
        {status === "success" && (
          <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        )}
      </div>
    </motion.div>
  );
};

interface LookupRecipientResult {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  email: string | null;
  avatar_url: string | null;
  account_number?: string | null;
}

interface InternalTransferResult {
  error?: string;
  transfer_id?: string;
  target_amount?: number;
  target_currency?: string;
}

// ─── Main component ─────────────────────────────────────────────────────────

const EfinmoneyP2PFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { requirePin, pinGate } = usePinGate();
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();

  // Search state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchRecipient, setSearchRecipient] = useState<Recipient | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Multi-recipient state
  const [recipients, setRecipients] = useState<RecipientEntry[]>([]);
  const [amountPerUser, setAmountPerUser] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [sending, setSending] = useState(false);

  const sender = wallets?.find((w) => w.wallet_id === selectedWalletId) || wallets?.[0];
  useEffect(() => {
    if (!selectedWalletId && wallets?.length) setSelectedWalletId(wallets[0].wallet_id);
  }, [wallets, selectedWalletId]);

  const fromCurrency = sender?.currency_code || "USD";
  const parsedAmount = parseFloat(amountPerUser) || 0;
  const pendingRecipients = recipients.filter((r) => r.status === "pending" || r.status === "failed");
  const totalRequired = parsedAmount * pendingRecipients.length;
  const insufficient = sender ? totalRequired > Number(sender.balance) : false;
  const hasPendingOrFailed = recipients.some((r) => r.status === "pending" || r.status === "failed");
  const succeededCount = recipients.filter((r) => r.status === "success").length;
  const failedCount = recipients.filter((r) => r.status === "failed").length;
  const allDone = recipients.length > 0 && recipients.every((r) => r.status === "success" || r.status === "failed");
  const totalRecipients = recipients.length;

  // Available currencies across all wallets + common fiats. Sorted with
  // CAD, USD, EUR, NGN first so the most-used rails aren't buried in alpha order.
  const currencyOptions = useMemo(() => {
    const codes = new Set<string>();
    wallets?.forEach((w) => codes.add(w.currency_code));
    ["USD", "CAD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "ZMW", "UGX", "TZS", "RWF", "MWK", "XAF", "XOF"].forEach((c) => codes.add(c));
    if (sender) codes.add(sender.currency_code);
    return sortByPriority(Array.from(codes));
  }, [wallets, sender]);

  // ── Add recipient (from quick-pick / search) ────────────────────────────

  const isAlreadyAdded = (userId: string) => recipients.some((r) => r.recipient.user_id === userId);

  const addRecipient = (recipient: Recipient) => {
    if (!sender) {
      toast.error("Select a wallet to send from first");
      return;
    }
    if (isAlreadyAdded(recipient.user_id)) {
      toast.info("Already in your list");
      return;
    }
    setRecipients((prev) => [
      ...prev,
      {
        recipient,
        currency: sender.currency_code,
        note: "",
        status: "pending" as const,
      },
    ]);
    toast.success(`${recipient.full_name || recipient.efin_tag || recipient.email} added`);
  };


  const removeRecipient = (userId: string) => {
    setRecipients((prev) => prev.filter((r) => r.recipient.user_id !== userId));
  };

  const updateRecipient = (userId: string, updates: Partial<RecipientEntry>) => {
    setRecipients((prev) => prev.map((r) =>
      r.recipient.user_id === userId ? { ...r, ...updates } : r,
    ));
  };

  // ── Send (parallel, failproof) ──────────────────────────────────────────

  const sendOne = async (entry: RecipientEntry): Promise<{ userId: string; success: boolean }> => {
    updateRecipient(entry.recipient.user_id, { status: "sending" });
    try {
      const senderName = profile?.full_name || user?.email || "an eFinMoney User";
      const senderTag = profile?.efin_tag || undefined;
      const { data, error } = await supabase.functions.invoke<InternalTransferResult>("internal-transfer", {
        body: {
          sender_wallet_id: sender!.wallet_id,
          recipient_user_id: entry.recipient.user_id,
          amount: parsedAmount,
          recipient_currency: entry.currency,
          note: entry.note,
          sender_name: senderName,
          sender_efin_tag: senderTag,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updateRecipient(entry.recipient.user_id, {
        status: "success",
        transferId: data?.transfer_id,
        targetAmount: data?.target_amount,
        targetCurrency: data?.target_currency,
      });
      return { userId: entry.recipient.user_id, success: true };
    } catch (e: unknown) {
      updateRecipient(entry.recipient.user_id, {
        status: "failed",
        error: e instanceof Error ? e.message : "Transfer failed",
      });
      return { userId: entry.recipient.user_id, success: false };
    }
  };

  const handleSendAll = async () => {
    if (!sender || parsedAmount <= 0) return;
    if (pendingRecipients.length === 0) {
      toast.info("All transfers already completed");
      return;
    }
    if (insufficient) {
      toast.error(`Insufficient balance. Need ${fmt(totalRequired)} ${fromCurrency}, have ${sender?.symbol}${fmt(Number(sender?.balance || 0))}`);
      return;
    }
    setSending(true);
    const settled = await Promise.allSettled(pendingRecipients.map(sendOne));
    setSending(false);
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["dashboard-transfers"] });
    const ok = settled.filter((r) => r.status === "fulfilled" && r.value.success).length;
    toast.success(`${ok} of ${totalRecipients} transfers completed`);
  };

  const retryRecipient = async (userId: string) => {
    const entry = recipients.find((r) => r.recipient.user_id === userId);
    if (!entry || !sender) return;
    if (parsedAmount <= 0) {
      toast.error("Enter an amount per recipient first");
      return;
    }
    await sendOne(entry);
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
  };

  // ── Reset ───────────────────────────────────────────────────────────────

  const reset = () => {
    setRecipients([]);
    setAmountPerUser("");
    setQuery("");
    setSearchRecipient(null);
    setNotFound(false);
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Search & Add ───────────────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label className="text-sm">Send to eFinMoney users</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Instant, free, in-network. Search by email, @tag, or account number. Add multiple recipients.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="email@example.com, @username, or 10-digit account #"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchRecipient(null); setNotFound(false); }}
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

          {searchRecipient && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                {searchRecipient.avatar_url
                  ? <img src={searchRecipient.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : <User className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {searchRecipient.full_name || searchRecipient.email}
                </p>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {searchRecipient.efin_tag && <span>@{searchRecipient.efin_tag}</span>}
                  {searchRecipient.account_number && <span>Acct: {searchRecipient.account_number}</span>}
                </div>
              </div>
              {isAlreadyAdded(searchRecipient.user_id) ? (
                <Badge variant="secondary">Added</Badge>
              ) : (
                <Button size="sm" onClick={addRecipient}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add to list
                </Button>
              )}
            </motion.div>
          )}

          {/* Badge row showing added recipients */}
          {recipients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {totalRecipients} recipient{totalRecipients !== 1 ? "s" : ""}:
              </span>
              {recipients.map((entry) => {
                const r = entry.recipient;
                return (
                  <Badge
                    key={r.user_id}
                    variant={
                      entry.status === "success" ? "default"
                      : entry.status === "failed" ? "destructive"
                      : "secondary"
                    }
                    className="gap-1 py-1 px-2 text-xs"
                  >
                    {entry.status === "success" && <CheckCircle2 className="w-3 h-3" />}
                    {entry.status === "failed" && <AlertCircle className="w-3 h-3" />}
                    {r.full_name || r.email}
                    {entry.status === "pending" && (
                      <button onClick={() => removeRecipient(r.user_id)} className="ml-1 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Wallet & Amount ──────────────────────────────────────────────── */}
      {totalRecipients > 0 && (
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
                  <Label className="text-xs text-muted-foreground">Amount per recipient</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountPerUser}
                    onChange={(e) => setAmountPerUser(e.target.value)}
                    className="text-2xl font-display h-14"
                  />
                </div>
              </div>

              {/* Balance summary — visible even at 0 to show wallet state */}
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                {/* Main rows */}
                <div className="p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recipients</span>
                    <span className="font-medium">{pendingRecipients.length} of {totalRecipients}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount per user</span>
                    <span className="font-medium">
                      {parsedAmount > 0 ? `${fmt(parsedAmount)} ${fromCurrency}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-1.5 mt-1.5">
                    <span>Wallet balance</span>
                    <span className="font-medium text-foreground">{sender?.symbol}{fmt(Number(sender?.balance || 0))}</span>
                  </div>
                  {parsedAmount > 0 && (
                    <div className="flex justify-between text-sm font-medium">
                      <span>Total required</span>
                      <span className={insufficient ? "text-destructive" : "text-foreground"}>
                        {fmt(totalRequired)} {fromCurrency}
                      </span>
                    </div>
                  )}
                </div>

                {/* Insufficient balance pill */}
                {insufficient && (
                  <div className="px-3 py-2 bg-destructive/10 border-t border-destructive/20 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    <span className="text-xs text-destructive font-medium">
                      Not enough balance. Needed {fmt(totalRequired)} {fromCurrency}, available {sender?.symbol}{fmt(Number(sender?.balance || 0))}.
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Recipient cards ──────────────────────────────────────────────── */}
      {totalRecipients > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Recipients ({totalRecipients})
            </h3>
            {allDone && (
              <div className="flex gap-2">
                {failedCount > 0 && succeededCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setRecipients((prev) => prev.filter((r) => r.status === "failed"))}>
                    Clear successful
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={reset}>
                  Start over
                </Button>
              </div>
            )}
          </div>

          {recipients.map((entry) => (
            <RecipientCard
              key={entry.recipient.user_id}
              entry={entry}
              fromCurrency={fromCurrency}
              currencies={currencyOptions}
              amountPerUser={parsedAmount}
              sending={sending}
              onUpdate={updateRecipient}
              onRemove={removeRecipient}
              onRetry={retryRecipient}
            />
          ))}
        </motion.div>
      )}

      {/* ── Send button ──────────────────────────────────────────────────── */}
      {totalRecipients > 0 && hasPendingOrFailed && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Button
            onClick={() => requirePin(handleSendAll, `${fmt(totalRequired)} ${fromCurrency} across ${pendingRecipients.length} recipient${pendingRecipients.length !== 1 ? "s" : ""}`)}
            disabled={sending || pendingRecipients.length === 0 || parsedAmount <= 0 || insufficient}
            className="w-full h-12 gradient-primary text-primary-foreground font-medium"
          >
            {sending ? (
              <LoadingSpinner size={16} />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send {fmt(parsedAmount)} {fromCurrency} to {pendingRecipients.length} recipient{pendingRecipients.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">
            No fees. Delivered instantly to their eFinMoney wallet.
          </p>
        </motion.div>
      )}

      {/* ── Batch complete summary ───────────────────────────────────────── */}
      {allDone && (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center space-y-4">
            {failedCount === 0 ? (
              <>
                <AnimatedCheck />
                <h2 className="text-2xl font-display font-bold text-foreground">All transfers complete</h2>
                <p className="text-muted-foreground">
                  Sent {fmt(parsedAmount)} {fromCurrency} each to {succeededCount} recipient{succeededCount !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  {succeededCount} of {totalRecipients} completed
                </h2>
                <p className="text-muted-foreground">
                  {failedCount} transfer{failedCount !== 1 ? "s" : ""} failed. Retry individually above, or send to new recipients.
                </p>
              </>
            )}
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={reset}>
                Send to new recipients
              </Button>
              {succeededCount > 0 && (
                <Button onClick={() => navigate("/transfers")}>
                  View transfers
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {pinGate}
    </div>
  );
};

export default EfinmoneyP2PFlow;
