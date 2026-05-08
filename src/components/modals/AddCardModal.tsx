import { useState } from "react";
import {
  Dialog,
  DialogContent,
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
import { useCardMutations, type Card as CardRow, type CardType, type CardNetwork } from "@/hooks/useCards";
import { useWallets } from "@/hooks/useWallets";
import { Copy, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim();

const luhnValid = (digits: string) => {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[digits.length - 1 - i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

const detectNetwork = (digits: string): CardNetwork =>
  digits.startsWith("4") ? "visa" : "mastercard";

const AddCardModal = ({ isOpen, onClose }: AddCardModalProps) => {
  const { createCard } = useCardMutations();
  const { data: wallets } = useWallets();

  const [mode, setMode] = useState<"issue" | "link">("issue");

  // Issue mode state
  const [cardType, setCardType] = useState<CardType>("debit");
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>("visa");
  const [cardholderName, setCardholderName] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("5000");
  const [creditLimit, setCreditLimit] = useState("10000");
  const [walletId, setWalletId] = useState<string>("");

  // Link mode state
  const [linkName, setLinkName] = useState("");
  const [linkPan, setLinkPan] = useState("");
  const [linkExp, setLinkExp] = useState(""); // MM/YY
  const [linkCvv, setLinkCvv] = useState("");
  const [linkWalletId, setLinkWalletId] = useState("");

  const [createdCard, setCreatedCard] = useState<CardRow | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCredit = cardType === "credit";

  const reset = () => {
    setMode("issue");
    setCardType("debit");
    setCardNetwork("visa");
    setCardholderName("");
    setSpendingLimit("5000");
    setCreditLimit("10000");
    setWalletId("");
    setLinkName("");
    setLinkPan("");
    setLinkExp("");
    setLinkCvv("");
    setLinkWalletId("");
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
    if (!isCredit && !walletId) return toast.error("Select a linked wallet");
    if (!isCredit && selectedWallet && Number(selectedWallet.balance) <= 0)
      return toast.error("Selected wallet has no available balance");
    if (isCredit && (!creditLimit || Number(creditLimit) <= 0))
      return toast.error("Enter a valid credit limit");

    try {
      const card = await createCard.mutateAsync({
        card_type: cardType,
        card_network: cardNetwork,
        cardholder_name: cardholderName.trim(),
        spending_limit: Number(spendingLimit) || 5000,
        credit_limit: isCredit ? Number(creditLimit) : null,
        wallet_id: isCredit ? null : walletId,
      });
      setCreatedCard(card);
    } catch {
      /* toast handled */
    }
  };

  const handleLink = async () => {
    if (!linkName.trim()) return toast.error("Cardholder name is required");
    const digits = linkPan.replace(/\D/g, "");
    if (!luhnValid(digits)) return toast.error("Invalid card number");
    const expMatch = linkExp.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!expMatch) return toast.error("Expiry must be MM/YY");
    const mm = parseInt(expMatch[1], 10);
    const yy = parseInt(expMatch[2], 10);
    if (mm < 1 || mm > 12) return toast.error("Invalid expiry month");
    if (!/^\d{3,4}$/.test(linkCvv)) return toast.error("Invalid CVV");
    if (!linkWalletId) return toast.error("Select a wallet to fund");

    try {
      await createCard.mutateAsync({
        card_type: "debit",
        card_network: detectNetwork(digits),
        cardholder_name: linkName.trim(),
        wallet_id: linkWalletId,
        external: {
          last_four: digits.slice(-4),
          expiry_month: mm,
          expiry_year: 2000 + yy,
        },
      });
      handleClose();
    } catch {
      /* toast handled */
    }
  };

  const copyDetails = async () => {
    if (!createdCard?.card_number) return;
    const text = `Card: ${createdCard.card_number}\nExpiry: ${String(createdCard.expiry_month).padStart(2, "0")}/${String(createdCard.expiry_year).slice(-2)}\nCVV: ${createdCard.cvv}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {createdCard ? "Card Created" : "Add New Card"}
          </DialogTitle>
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
                  {reveal && createdCard.card_number
                    ? formatPan(createdCard.card_number)
                    : `•••• •••• •••• ${createdCard.last_four}`}
                </p>
                <button onClick={() => setReveal((r) => !r)} className="p-1 hover:bg-primary-foreground/10 rounded">
                  {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-between text-sm">
                <div>
                  <p className="opacity-70 text-xs">Cardholder</p>
                  <p className="font-medium">{createdCard.cardholder_name}</p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">Expires</p>
                  <p className="font-mono">
                    {String(createdCard.expiry_month).padStart(2, "0")}/{String(createdCard.expiry_year).slice(-2)}
                  </p>
                </div>
                <div>
                  <p className="opacity-70 text-xs">CVV</p>
                  <p className="font-mono">{reveal ? createdCard.cvv : "•••"}</p>
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
              Save these details now. CVV will be masked after closing.
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
                  <Label>Card Type</Label>
                  <Select value={cardType} onValueChange={(v) => setCardType(v as CardType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Debit</SelectItem>
                      <SelectItem value="debit_visa">Debit Visa</SelectItem>
                      <SelectItem value="credit">Credit Card</SelectItem>
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
                <div className="space-y-2">
                  <Label>Linked Wallet</Label>
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger><SelectValue placeholder="Select a wallet" /></SelectTrigger>
                    <SelectContent>
                      {wallets?.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  We only store the last 4 digits and expiry. Your full number and CVV are
                  re-collected via our secure payment processor at top-up time.
                </span>
              </div>

              <div className="space-y-2">
                <Label>Cardholder Name</Label>
                <Input
                  placeholder="JOHN DOE"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value.toUpperCase())}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label>Card Number</Label>
                <Input
                  inputMode="numeric"
                  placeholder="4242 4242 4242 4242"
                  value={linkPan}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 19);
                    setLinkPan(d.replace(/(.{4})/g, "$1 ").trim());
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Expiry (MM/YY)</Label>
                  <Input
                    placeholder="12/29"
                    value={linkExp}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setLinkExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                    }}
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CVV</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="123"
                    value={linkCvv}
                    onChange={(e) => setLinkCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Wallet to Fund</Label>
                <Select value={linkWalletId} onValueChange={setLinkWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select a wallet" /></SelectTrigger>
                  <SelectContent>
                    {wallets?.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleLink} disabled={createCard.isPending}>
                  {createCard.isPending ? "Linking..." : "Link Card"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCardModal;
