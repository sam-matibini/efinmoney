import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Loader2, Plus, Snowflake, Wallet, Wifi } from "lucide-react";
import { toast } from "sonner";
import { issueSwychrCard, listSwychrCards, swychrCardOp, type SwychrCardRow } from "@/lib/swychrCards";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";

function LiteCardFace({
  card,
  holderName,
}: {
  card: SwychrCardRow;
  holderName?: string | null;
}) {
  const frozen = card.status === "frozen";
  const isVisa = card.card_type?.toUpperCase() === "VISA";

  return (
    <div
      className={`relative aspect-[1.586/1] w-full max-w-[320px] rounded-2xl overflow-hidden text-white shadow-xl ${
        frozen ? "opacity-70 grayscale" : ""
      }`}
      style={{
        background: isVisa
          ? "linear-gradient(135deg, #0a1f1c 0%, #0f3a30 35%, #065f46 70%, #0d7a5f 100%)"
          : "linear-gradient(135deg, #1a1028 0%, #2d1b4e 40%, #3b2760 75%, #4a3280 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.16) 42%, rgba(255,255,255,0.24) 48%, rgba(255,255,255,0.08) 55%, transparent 68%)",
        }}
      />
      <div className="relative h-full p-4 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="font-display text-base leading-none tracking-tight">
            <span className="font-light opacity-90">efin</span>
            <span className="font-bold">Money</span>
          </div>
          {!frozen && <Wifi className="w-4 h-4 rotate-90 opacity-85" aria-hidden />}
        </div>
        <div
          className="w-8 h-6 rounded-[4px]"
          style={{
            background: "linear-gradient(135deg, #d4a64a 0%, #f0d27a 40%, #b6822f 100%)",
          }}
        />
        <div className="font-mono text-sm tracking-[0.2em]">•••• •••• •••• {card.last_four}</div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider opacity-60">Cardholder</p>
            <p className="text-xs font-medium truncate uppercase">
              {holderName || "Cardholder"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-semibold tracking-wide">
              {isVisa ? "VISA" : "Mastercard"}
            </p>
            <p className="text-[9px] capitalize opacity-70">{frozen ? "Frozen" : "Active"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SwychrCardsPanel() {
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();
  const [cards, setCards] = useState<SwychrCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("25");
  const [cardType, setCardType] = useState<"VISA" | "MASTERCARD">("MASTERCARD");
  const [walletId, setWalletId] = useState("");
  const [topUpCard, setTopUpCard] = useState<SwychrCardRow | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("25");
  const [toppingUp, setToppingUp] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setCards(await listSwychrCards());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (wallets?.length && !walletId) setWalletId(wallets[0].wallet_id);
  }, [wallets, walletId]);

  const handleIssue = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount");
    setIssuing(true);
    try {
      await issueSwychrCard({
        amount: amt,
        card_type: cardType,
        wallet_id: walletId || undefined,
      });
      toast.success("Virtual card created");
      setShowForm(false);
      setAmount("25");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create card");
    } finally {
      setIssuing(false);
    }
  };

  const handleFreeze = async (card: SwychrCardRow) => {
    const action = card.status === "frozen" ? "unfreeze" : "freeze";
    try {
      await swychrCardOp({ action, card_id: card.swychr_card_id });
      toast.success(action === "freeze" ? "Card frozen" : "Card unfrozen");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update card");
    }
  };

  const handleTopUp = async () => {
    if (!topUpCard) return;
    const amt = Number(topUpAmount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount");
    setToppingUp(true);
    try {
      await swychrCardOp({
        action: "recharge",
        card_id: topUpCard.swychr_card_id,
        amount: amt,
      });
      toast.success("Card topped up");
      setTopUpCard(null);
      setTopUpAmount("25");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Instant virtual cards
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create a Visa or Mastercard for online spending. Cards are funded in USD.
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            className="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            New card
          </Button>
        )}
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border bg-card/80 p-4 sm:p-5 space-y-4 shadow-sm"
        >
          <div>
            <p className="font-medium">Create virtual card</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              An issuance fee may apply. Your cardholder profile is set up automatically.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="lite-amount">Initial load (USD)</Label>
              <Input
                id="lite-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={cardType} onValueChange={(v) => setCardType(v as "VISA" | "MASTERCARD")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MASTERCARD">Mastercard</SelectItem>
                  <SelectItem value="VISA">Visa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {(wallets ?? []).map((w) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      {w.flag_emoji} {w.currency_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleIssue}
              disabled={issuing}
            >
              {issuing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create card"
              )}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={issuing}>
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {topUpCard && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border bg-card/80 p-4 space-y-3 shadow-sm"
        >
          <p className="font-medium">Top up ·••• {topUpCard.last_four}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label htmlFor="topup-amount">Amount (USD)</Label>
              <Input
                id="topup-amount"
                type="number"
                min={1}
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>
            <Button
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleTopUp}
              disabled={toppingUp}
            >
              {toppingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
            <Button variant="ghost" onClick={() => setTopUpCard(null)} disabled={toppingUp}>
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading cards…
        </p>
      ) : cards.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium">No virtual cards yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create one for subscriptions, travel, and online checkout.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            New card
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <LiteCardFace card={card} holderName={profile?.full_name} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setTopUpCard(card);
                    setTopUpAmount("25");
                  }}
                >
                  <Wallet className="h-3.5 w-3.5 mr-1.5" />
                  Top up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleFreeze(card)}
                >
                  <Snowflake className="h-3.5 w-3.5 mr-1.5" />
                  {card.status === "frozen" ? "Unfreeze" : "Freeze"}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
