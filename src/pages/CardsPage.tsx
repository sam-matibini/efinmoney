import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Lock, Eye, EyeOff, Snowflake, Settings, Pencil, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import EditCardModal from "@/components/modals/EditCardModal";
import DeleteCardModal from "@/components/modals/DeleteCardModal";
import AddCardModal from "@/components/modals/AddCardModal";
import { useCards, useCardMutations, type Card as CardRow } from "@/hooks/useCards";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatExpires = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
};

const CardsPage = () => {
  const { data: cards, isLoading } = useCards();
  const { updateCardStatus, updateCard, deleteCard } = useCardMutations();

  const [showCardNumbers, setShowCardNumbers] = useState<Record<string, boolean>>({});
  const [editCard, setEditCard] = useState<CardRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const toggleCardNumber = (cardId: string) => {
    setShowCardNumbers((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handleToggleFreeze = (card: CardRow) => {
    updateCardStatus.mutate({
      id: card.id,
      status: card.status === "frozen" ? "active" : "frozen",
    });
  };

  const handleRequestPhysical = (card: CardRow) => {
    updateCard.mutate({ id: card.id, card_type: "physical" });
  };

  const colorFor = (network: string, idx: number) =>
    network === "mastercard" || idx % 2 === 1
      ? "bg-gradient-to-br from-purple-500 to-pink-500"
      : "gradient-primary";

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />

      <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">My Cards</h1>
              <p className="text-muted-foreground">Manage your virtual and physical cards</p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Card
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-[220px] rounded-2xl" />
              ))}
            </div>
          ) : !cards || cards.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CreditCard className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-display font-semibold mb-2">No Cards Yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Create your first virtual or physical card to start spending securely worldwide.
                </p>
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add your first card
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cards.map((card, index) => {
                const isFrozen = card.status === "frozen";
                const colorClass = colorFor(card.card_network, index);
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className={`overflow-hidden ${colorClass} text-primary-foreground ${card.status !== "active" ? "opacity-75" : ""}`}>
                      <CardContent className="p-6 relative">
                        <div className="absolute inset-0 opacity-10">
                          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-foreground/40 blur-3xl" />
                          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-foreground/40 blur-2xl" />
                        </div>

                        {card.status !== "active" && (
                          <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px] z-10 flex items-center justify-center">
                            <Badge variant="secondary">
                              {card.status === "frozen" ? "❄️ Frozen" : "🚫 Cancelled"}
                            </Badge>
                          </div>
                        )}

                        <div className="relative z-20">
                          <div className="flex justify-between items-start mb-8">
                            <div>
                              <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 capitalize">
                                {card.card_type === "debit_visa" ? "Debit Visa" : card.card_type}
                              </Badge>
                              <p className="text-primary-foreground/70 text-xs mt-1">
                                {card.cardholder_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-primary-foreground/70 text-sm capitalize">
                                {card.card_network}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 hover:bg-primary-foreground/10 rounded">
                                    <Settings className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditCard(card)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit Card
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleFreeze(card)}>
                                    <Snowflake className="w-4 h-4 mr-2" />
                                    {isFrozen ? "Unfreeze" : "Freeze"} Card
                                  </DropdownMenuItem>
                                  {card.card_type === "virtual" && (
                                    <DropdownMenuItem onClick={() => handleRequestPhysical(card)}>
                                      <CreditCard className="w-4 h-4 mr-2" />
                                      Request Physical
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget(card)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Card
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mb-6">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xl tracking-wider">
                                {showCardNumbers[card.id] && card.card_number
                                  ? card.card_number.replace(/(.{4})/g, "$1 ").trim()
                                  : `•••• •••• •••• ${card.last_four}`}
                              </p>
                              <button
                                onClick={() => toggleCardNumber(card.id)}
                                className="p-1 hover:bg-primary-foreground/10 rounded"
                              >
                                {showCardNumbers[card.id] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="flex justify-between items-end gap-3">
                            <div>
                              <p className="text-primary-foreground/70 text-xs mb-1">Spending Limit</p>
                              <p className="text-2xl font-display font-bold">
                                ${Number(card.spending_limit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-primary-foreground/70 text-xs mb-1">Expires</p>
                              <p className="font-mono">
                                {card.expiry_month && card.expiry_year
                                  ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                                  : formatExpires(card.expires_at)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-primary-foreground/70 text-xs mb-1">CVV</p>
                              <p className="font-mono">
                                {showCardNumbers[card.id] && card.cvv ? card.cvv : "•••"}
                              </p>
                            </div>
                          </div>
                          {card.card_number && (
                            <button
                              onClick={async () => {
                                const exp = card.expiry_month && card.expiry_year
                                  ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                                  : formatExpires(card.expires_at);
                                await navigator.clipboard.writeText(
                                  `Number: ${card.card_number}\nExpiry: ${exp}\nCVV: ${card.cvv ?? ""}`
                                );
                                toast.success("Card details copied");
                              }}
                              className="absolute bottom-3 right-3 z-30 p-1.5 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/80"
                              title="Copy card details"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex gap-2 mt-3">
                      {card.funding_source === "external" ? (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => setFundCard(card)}
                        >
                          <CreditCard className="w-4 h-4 mr-1" />
                          Fund Wallet
                        </Button>
                      ) : (
                        <Button
                          variant={isFrozen ? "default" : "outline"}
                          size="sm"
                          className="flex-1"
                          onClick={() => handleToggleFreeze(card)}
                        >
                          <Snowflake className="w-4 h-4 mr-1" />
                          {isFrozen ? "Unfreeze" : "Freeze"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditCard(card)}
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        Settings
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setDeleteTarget(card)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {cards && cards.length > 0 && cards.every((c) => c.card_type === "virtual") && (
            <Card>
              <CardContent className="py-8 text-center">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Get a Physical Card</h3>
                <p className="text-muted-foreground mb-4">
                  Order a physical debit card for in-store purchases and ATM withdrawals
                </p>
                <Button variant="outline" onClick={() => cards[0] && handleRequestPhysical(cards[0])}>
                  Request Physical Card
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Instant Freeze</h4>
                <p className="text-sm text-muted-foreground">
                  Freeze your card instantly from the app if it's lost or stolen
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Virtual Cards</h4>
                <p className="text-sm text-muted-foreground">
                  Create unlimited virtual cards for secure online shopping
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Spending Limits</h4>
                <p className="text-sm text-muted-foreground">
                  Set custom spending limits for better financial control
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>

      <MobileNav />

      <AddCardModal isOpen={addOpen} onClose={() => setAddOpen(false)} />

      <EditCardModal
        isOpen={!!editCard}
        onClose={() => setEditCard(null)}
        card={
          editCard
            ? {
                id: editCard.id,
                type: editCard.card_type,
                last_four: editCard.last_four,
                brand: editCard.card_network,
                status: editCard.status,
                currency: "USD",
                balance: 0,
                expires: formatExpires(editCard.expires_at),
              }
            : null
        }
        onSave={(id, data) => {
          const patch: Partial<CardRow> = {};
          if (data.dailyLimit !== undefined) patch.spending_limit = Number(data.dailyLimit);
          if (data.nickname !== undefined) patch.cardholder_name = data.nickname || editCard?.cardholder_name || "";
          if (Object.keys(patch).length > 0) updateCard.mutate({ id, ...patch });
        }}
      />

      <DeleteCardModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        card={
          deleteTarget
            ? {
                id: deleteTarget.id,
                type: deleteTarget.card_type,
                last_four: deleteTarget.last_four,
                brand: deleteTarget.card_network,
                status: deleteTarget.status,
                currency: "USD",
                balance: 0,
                expires: formatExpires(deleteTarget.expires_at),
              }
            : null
        }
        onDelete={(id) => deleteCard.mutate(id)}
      />
    </div>
  );
};

export default CardsPage;
