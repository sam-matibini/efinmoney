import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Snowflake, Wallet } from "lucide-react";
import { toast } from "sonner";
import { issueSwychrCard, listSwychrCards, swychrCardOp, type SwychrCardRow } from "@/lib/swychrCards";
import { useWallets } from "@/hooks/useWallets";

export default function SwychrCardsPanel() {
  const { data: wallets } = useWallets();
  const [cards, setCards] = useState<SwychrCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [swychrUserId, setSwychrUserId] = useState("");
  const [amount, setAmount] = useState("10");
  const [cardType, setCardType] = useState<"VISA" | "MASTERCARD">("MASTERCARD");
  const [walletId, setWalletId] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      setCards(await listSwychrCards());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load Swychr cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (wallets?.length && !walletId) setWalletId(wallets[0].wallet_id);
  }, [wallets, walletId]);

  const handleIssue = async () => {
    if (!swychrUserId.trim()) return toast.error("Swychr user ID required (from KYC onboarding)");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid top-up amount");
    setIssuing(true);
    try {
      await issueSwychrCard({
        swychr_user_id: swychrUserId.trim(),
        amount: amt,
        card_type: cardType,
        wallet_id: walletId || undefined,
      });
      toast.success("Virtual card issued");
      setSwychrUserId("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Card issue failed");
    } finally {
      setIssuing(false);
    }
  };

  const handleOp = async (card: SwychrCardRow, action: "freeze" | "unfreeze" | "recharge") => {
    try {
      if (action === "recharge") {
        const amt = Number(prompt("Recharge amount (USD)?", "10"));
        if (!Number.isFinite(amt) || amt < 1) return;
        await swychrCardOp({ action: "recharge", card_id: card.swychr_card_id, amount: amt });
      } else {
        await swychrCardOp({ action, card_id: card.swychr_card_id });
      }
      toast.success("Card updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  return (
    <Card className="border-violet-500/25">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-violet-400" />
          Swychr virtual cards
          <Badge variant="outline" className="text-xs">Sandbox</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Issue lite virtual cards via Swychr. Complete KYC in sandbox first to obtain a Swychr user ID.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Swychr user ID</Label>
            <Input value={swychrUserId} onChange={(e) => setSwychrUserId(e.target.value)} placeholder="From create_full_user" />
          </div>
          <div className="space-y-2">
            <Label>Initial load (USD)</Label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Card network</Label>
            <Select value={cardType} onValueChange={(v) => setCardType(v as "VISA" | "MASTERCARD")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MASTERCARD">Mastercard</SelectItem>
                <SelectItem value="VISA">Visa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Link wallet (optional)</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
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
        <Button onClick={handleIssue} disabled={issuing}>
          {issuing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Issuing…</> : "Issue lite card"}
        </Button>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading cards…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Swychr cards yet.</p>
        ) : (
          <div className="space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div>
                  <p className="font-medium">{card.card_type} ·••• {card.last_four}</p>
                  <p className="text-xs text-muted-foreground capitalize">{card.status}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleOp(card, "recharge")}>
                    <Wallet className="h-3.5 w-3.5 mr-1" />Top up
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleOp(card, card.status === "frozen" ? "unfreeze" : "freeze")}>
                    <Snowflake className="h-3.5 w-3.5 mr-1" />
                    {card.status === "frozen" ? "Unfreeze" : "Freeze"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
