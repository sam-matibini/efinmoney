import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SYSTEM_DEFAULT_CURRENCY } from "@/lib/systemDefaults";

import { useCardMutations, type CreatedCardResult, type CardType, type CardNetwork } from "@/hooks/useCards";
import { useWallets } from "@/hooks/useWallets";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import SaveCardForm from "@/components/cards/SaveCardForm";
import ManualCardForm from "@/components/cards/ManualCardForm";
import { STRIPE_PAYMENTS_ENABLED } from "@/lib/stripeDisabled";


interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "issue" | "link";
}

const formatPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim();

const AddCardModal = ({ isOpen, onClose, defaultMode = "issue" }: AddCardModalProps) => {
  const { createCard } = useCardMutations();
  const { data: wallets } = useWallets();

  const [mode, setMode] = useState<"issue" | "link">(defaultMode);

  useEffect(() => {
    if (isOpen) setMode(defaultMode);
  }, [isOpen, defaultMode]);

  // Issue mode state
  const [cardType, setCardType] = useState<CardType>("virtual");
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>("visa");
  const [cardholderName, setCardholderName] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("5000");
  const [creditLimit, setCreditLimit] = useState("10000");
  const [walletId, setWalletId] = useState<string>("");
  const [initialFund, setInitialFund] = useState("");

  const [createdCard, setCreatedCard] = useState<CreatedCardResult | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const canReveal = !!(createdCard?.pan && createdCard?.cvv);
  const expiryLabel = createdCard
    ? `${String(createdCard.expiry_month).padStart(2, "0")}/${String(createdCard.expiry_year).slice(-2)}`
    : "";

  const isCredit = cardType === "credit";

  const reset = () => {
    setMode(defaultMode);
    setCardType("virtual");
    setCardNetwork("visa");
    setCardholderName("");
    setSpendingLimit("5000");
    setCreditLimit("10000");
    setWalletId("");
    setInitialFund("");
    setCreatedCard(null);
    setReveal(false);
    setCopied(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectedWallet = wallets?.find((w) => w.wallet_id === walletId);

  const handleIssue = async () => {
    if (!cardholderName.trim()) return toast.error("Cardholder name is required");
    if (isCredit && (!creditLimit || Number(creditLimit) <= 0))

      return toast.error("Enter a valid credit limit");

    const fundAmt = Number(initialFund);
    if (!isCredit && fundAmt > 0 && selectedWallet && fundAmt > Number(selectedWallet.balance)) {
      return toast.error("Initial fund exceeds wallet balance");
    }

    try {
      const card = await createCard.mutateAsync({
        card_type: cardType,
        card_network: cardNetwork,
        cardholder_name: cardholderName.trim(),
        spending_limit: Number(spendingLimit) || 5000,
        credit_limit: isCredit ? Number(creditLimit) : null,
        wallet_id: isCredit || !walletId ? null : walletId,
        currency_code: selectedWallet?.currency_code ?? SYSTEM_DEFAULT_CURRENCY,

        initial_fund: !isCredit && fundAmt > 0 ? fundAmt : undefined,
      });
      setCreatedCard(card);
      setReveal(!!card.pan);
    } catch {
      /* toast handled */
    }
  };

  const copyDetails = async () => {
    if (!createdCard) return;
    const lines = [
      `Cardholder: ${createdCard.cardholder_name}`,
      createdCard.pan
        ? `Card number: ${formatPan(createdCard.pan)}`
        : `Card ending: ${createdCard.last_four}`,
      `Expiry: ${expiryLabel}`,
      createdCard.cvv ? `CVV: ${createdCard.cvv}` : undefined,
      createdCard.currency_code && Number(createdCard.balance) > 0
        ? `Balance: ${createdCard.currency_code} ${Number(createdCard.balance).toFixed(2)}`
        : undefined,
    ].filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Card details copied");
  };


  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {createdCard ? "Card Created" : "Add New Card"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {createdCard
              ? "Your new card details and optional initial balance."
              : "Issue a new virtual card or link an existing card from another bank."}
          </DialogDescription>
        </DialogHeader>

        {createdCard ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl p-5 bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
              <div className="flex justify-between items-start mb-6">
                <span className="text-xs uppercase opacity-80">{createdCard.card_type.replace("_", " ")}</span>
                <span className="text-sm capitalize">{createdCard.card_network}</span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <p className="font-mono text-lg tracking-wider">
                  {reveal && createdCard.pan
                    ? formatPan(createdCard.pan)
                    : `•••• •••• •••• ${createdCard.last_four}`}
                </p>
                {canReveal && (
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    className="p-1 hover:bg-primary-foreground/10 rounded"
                    aria-label={reveal ? "Hide card details" : "Reveal card details"}
                  >
                    {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {Number(createdCard.balance) > 0 && (
                <p className="text-sm mb-3 opacity-90">
                  Funded: {createdCard.currency_code || "USD"}{" "}
                  {Number(createdCard.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
              <div className="flex justify-between text-sm">
                <div>
                  <p className="opacity-70 text-xs">Cardholder</p>
                  <p className="font-medium">{createdCard.cardholder_name}</p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">Expires</p>
                  <p className="font-mono">{expiryLabel}</p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">CVV</p>
                  <p className="font-mono">{reveal && createdCard.cvv ? createdCard.cvv : "•••"}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={copyDetails}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied" : "Copy details"}
              </Button>
              <Button className="flex-1" onClick={handleClose}>Done</Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Your full card number and CVV are saved securely. View them anytime from My Cards with your transaction PIN.
            </p>
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "issue" | "link")} className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="issue">Issue new</TabsTrigger>
              <TabsTrigger value="link">Link existing</TabsTrigger>
            </TabsList>

            <TabsContent value="issue" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Cardholder Name</Label>
                <Input
                  placeholder="JOHN DOE"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
                  maxLength={50}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Card format</Label>
                  <Select
                    value={cardType === "credit" ? "credit" : cardType === "physical" ? "physical" : "virtual"}
                    onValueChange={(v) => setCardType(v as CardType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="virtual">Virtual — instant online</SelectItem>
                      <SelectItem value="physical">Physical — chip card</SelectItem>
                      <SelectItem value="credit">Credit line</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select value={cardNetwork} onValueChange={(v) => setCardNetwork(v as CardNetwork)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="mastercard">Mastercard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!isCredit && (
                <>
                  <div className="space-y-2">
                    <Label>Linked Wallet (optional)</Label>
                    <Select
                      value={walletId || "none"}
                      onValueChange={(v) => setWalletId(v === "none" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="No wallet — fund later" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No wallet — fund later</SelectItem>
                        {wallets?.map((w) => (
                          <SelectItem key={w.wallet_id} value={w.wallet_id}>
                            {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {selectedWallet
                        ? "Card spends from its own balance. Fund it from this wallet when creating or anytime after."
                        : `Skip this and fund the card later from any wallet. The card will be issued in ${SYSTEM_DEFAULT_CURRENCY}.`}
                    </p>
                  </div>
                  {selectedWallet && (
                    <div className="space-y-2">
                      <Label>Initial fund (optional)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={initialFund}
                        onChange={(e) => setInitialFund(e.target.value)}
                      />
                      {Number(initialFund) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {selectedWallet.currency_code} {Number(initialFund).toFixed(2)} will move from your wallet to this card.
                        </p>
                      )}
                    </div>
                  )}

                </>
              )}

              {isCredit ? (
                <div className="space-y-2">
                  <Label>Credit Limit ($)</Label>
                  <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Spending Limit ($)</Label>
                  <Input type="number" value={spendingLimit} onChange={(e) => setSpendingLimit(e.target.value)} />
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleIssue} disabled={!cardholderName.trim() || createCard.isPending}>
                  {createCard.isPending ? "Creating..." : "Create Card"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="link" className="space-y-4 mt-4">
              {STRIPE_PAYMENTS_ENABLED ? (
                <SaveCardForm onSuccess={handleClose} onCancel={handleClose} />
              ) : (
                <ManualCardForm onSuccess={handleClose} onCancel={handleClose} />
              )}

            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCardModal;
