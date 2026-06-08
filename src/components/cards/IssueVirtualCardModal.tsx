import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useIssuedCardMutations, useIssuingBalance, type IssuedCardPurpose } from "@/hooks/useIssuedCards";
import { useProfile } from "@/hooks/useProfile";
import { Sparkles, Wifi, CreditCard, Smartphone, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface IssueVirtualCardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (cardId: string) => void;
}

const IssueVirtualCardModal = ({ open, onClose, onCreated }: IssueVirtualCardModalProps) => {
  const { data: wallets } = useWallets();
  const { createCard, fundCard } = useIssuedCardMutations();
  const { data: balance, isLoading: balLoading, refetch: refetchBal } = useIssuingBalance();
  const { data: profile } = useProfile() as any;

  const [cardType, setCardType] = useState<"virtual" | "physical">("virtual");
  const [nickname, setNickname] = useState("");
  const [purpose, setPurpose] = useState<IssuedCardPurpose>("personal");
  const [currency, setCurrency] = useState("CAD");
  const [walletId, setWalletId] = useState<string>("");
  const [monthlyLimit, setMonthlyLimit] = useState("2000");
  const [perAuthLimit, setPerAuthLimit] = useState("500");
  const [tapToPay, setTapToPay] = useState(true);
  const [initialFund, setInitialFund] = useState("");
  // Shipping (physical only) — pre-filled from profile
  const [shipName, setShipName] = useState("");
  const [shipLine1, setShipLine1] = useState("");
  const [shipLine2, setShipLine2] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipPostal, setShipPostal] = useState("");
  const [shipCountry, setShipCountry] = useState("CA");
  const [shipService, setShipService] = useState<"standard" | "express" | "priority">("standard");

  useEffect(() => {
    if (open) refetchBal();
  }, [open, refetchBal]);

  useEffect(() => {
    if (!profile) return;
    setShipName((n) => n || profile.full_name || "");
    setShipLine1((v) => v || profile.street_address || "");
    setShipCity((v) => v || profile.city || "");
    setShipState((v) => v || profile.state_province || "");
    setShipPostal((v) => v || profile.postal_code || "");
    setShipCountry((v) => v || (profile.address_country || profile.country_code || "CA").toUpperCase().slice(0, 2));
  }, [profile]);

  const reset = () => {
    setCardType("virtual");
    setNickname("");
    setPurpose("personal");
    setCurrency("CAD");
    setWalletId("");
    setMonthlyLimit("2000");
    setPerAuthLimit("500");
    setTapToPay(true);
    setInitialFund("");
  };

  const matchingWallets = (wallets || []).filter((w: any) => w.currency_code === currency);
  const issuingAvail = balance?.available?.[currency] ?? 0;
  const lowBalance = issuingAvail <= 0;

  const submit = async () => {
    const res = await createCard.mutateAsync({
      nickname: nickname.trim() || undefined,
      currency,
      purpose,
      card_type: cardType,
      funding_wallet_id: walletId || undefined,
      tap_to_pay: tapToPay,
      controls: {
        monthly_limit: Number(monthlyLimit) || undefined,
        per_authorization_limit: Number(perAuthLimit) || undefined,
        single_use: purpose === "single_use",
      },
      shipping: cardType === "physical" ? {
        name: shipName.trim(),
        line1: shipLine1.trim(),
        line2: shipLine2.trim() || undefined,
        city: shipCity.trim(),
        state: shipState.trim(),
        postal_code: shipPostal.trim(),
        country: shipCountry.trim().toUpperCase().slice(0, 2),
        service: shipService,
      } : undefined,
    });

    const newCardId = res?.card?.id;
    const fundAmt = Number(initialFund);
    if (newCardId && walletId && fundAmt > 0) {
      try {
        await fundCard.mutateAsync({ card_id: newCardId, wallet_id: walletId, amount: fundAmt });
      } catch {
        // toast already shown by mutation
      }
    }

    reset();
    onClose();
    if (newCardId) onCreated?.(newCardId);
  };

  const physicalShipValid = cardType !== "physical" || (
    shipName.trim() && shipLine1.trim() && shipCity.trim() && shipPostal.trim() && shipCountry.trim()
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Issue eFinVISA Card
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Issuing balance */}
          <div className={`rounded-lg border p-3 flex items-start gap-3 ${lowBalance ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/30"}`}>
            <AlertCircle className={`w-4 h-4 mt-0.5 ${lowBalance ? "text-amber-500" : "text-muted-foreground"}`} />
            <div className="text-xs flex-1">
              <div className="font-medium text-foreground">Issuing balance</div>
              <div className="text-muted-foreground mt-0.5">
                {balLoading ? "Checking…" :
                  Object.keys(balance?.available || {}).length === 0
                    ? "No Issuing balance found. Top up in Stripe before issuing."
                    : Object.entries(balance!.available).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" · ")}
              </div>
              {lowBalance && !balLoading && (
                <div className="text-amber-500 mt-1">{currency} Issuing balance is 0 — card create will fail until topped up.</div>
              )}
            </div>
          </div>

          {/* Card type */}
          <Tabs value={cardType} onValueChange={(v) => setCardType(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="virtual"><Smartphone className="w-3.5 h-3.5 mr-1.5" />Virtual</TabsTrigger>
              <TabsTrigger value="physical"><CreditCard className="w-3.5 h-3.5 mr-1.5" />Physical</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>Nickname (optional)</Label>
            <Input
              placeholder="e.g. Subscriptions, Travel"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as IssuedCardPurpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="subscription">Subscription lock</SelectItem>
                  <SelectItem value="single_use">Single-use</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Funding wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select a wallet" /></SelectTrigger>
              <SelectContent>
                {matchingWallets.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No {currency} wallet found</div>
                )}
                {matchingWallets.map((w: any) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {walletId && (
            <div className="space-y-2">
              <Label>Load funds now ({currency}) — optional</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={initialFund}
                onChange={(e) => setInitialFund(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pulls from the selected wallet into the card float immediately after creation.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Per-transaction limit ({currency})</Label>
              <Input type="number" value={perAuthLimit} onChange={(e) => setPerAuthLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Monthly limit ({currency})</Label>
              <Input type="number" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            </div>
          </div>

          {cardType === "physical" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-sm font-medium">Shipping address</div>
              <div className="space-y-2">
                <Label>Recipient name</Label>
                <Input value={shipName} onChange={(e) => setShipName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Street address</Label>
                <Input value={shipLine1} onChange={(e) => setShipLine1(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Apt / Unit (optional)</Label>
                <Input value={shipLine2} onChange={(e) => setShipLine2(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={shipCity} onChange={(e) => setShipCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Province / State</Label>
                  <Input value={shipState} onChange={(e) => setShipState(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Postal code</Label>
                  <Input value={shipPostal} onChange={(e) => setShipPostal(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Country (ISO-2)</Label>
                  <Input value={shipCountry} onChange={(e) => setShipCountry(e.target.value)} maxLength={2} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Shipping speed</Label>
                <Select value={shipService} onValueChange={(v) => setShipService(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (5–8 business days)</SelectItem>
                    <SelectItem value="express">Express (2–3 business days)</SelectItem>
                    <SelectItem value="priority">Priority (1–2 business days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Your physical card arrives inactive — activate it from this page when it reaches you.
              </p>
            </div>
          )}

          {cardType === "virtual" && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex gap-3">
                <Wifi className="w-4 h-4 mt-0.5 text-indigo-500 rotate-90" />
                <div>
                  <Label htmlFor="tap-to-pay" className="text-sm">Tap to pay</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add this card to Apple Pay or Google Pay for in-store contactless payments.
                  </p>
                </div>
              </div>
              <Switch id="tap-to-pay" checked={tapToPay} onCheckedChange={setTapToPay} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {cardType === "virtual"
              ? `eFinVISA virtual cards work instantly online. Funded from your ${currency} wallet — every authorization checks your balance in real time.`
              : `Your eFinVISA physical card ships from Stripe and works worldwide once activated.`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={createCard.isPending || fundCard.isPending || !physicalShipValid}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {createCard.isPending || fundCard.isPending
              ? "Creating…"
              : cardType === "physical" ? "Order eFinVISA" : "Create eFinVISA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueVirtualCardModal;
