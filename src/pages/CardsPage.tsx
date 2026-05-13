import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Lock, Unlock, Settings, Trash2, Snowflake, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import EditCardModal from "@/components/modals/EditCardModal";
import DeleteCardModal from "@/components/modals/DeleteCardModal";
import AddCardModal from "@/components/modals/AddCardModal";
import CardPaymentModal from "@/components/modals/CardPaymentModal";
import FlipCard from "@/components/cards/FlipCard";
import CardStack from "@/components/cards/CardStack";
import { useCards, useCardMutations, type Card as CardRow } from "@/hooks/useCards";
import { useSavedCards, useDeleteSavedCard } from "@/hooks/useSavedCards";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STRIPE_PREFIX = "stripe:";

const formatExpires = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
};

interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

const ActionTile = ({ icon, label, onClick, variant = "default" }: ActionTileProps) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 group"
  >
    <span
      className={`w-12 h-12 rounded-2xl flex items-center justify-center border bg-card group-hover:bg-accent transition-colors ${
        variant === "destructive" ? "text-destructive" : "text-foreground"
      }`}
    >
      {icon}
    </span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </button>
);

const CardsPage = () => {
  const navigate = useNavigate();
  const { data: issuedCards, isLoading } = useCards();
  const { data: stripeCards } = useSavedCards();
  const { updateCardStatus, updateCard, deleteCard } = useCardMutations();
  const deleteStripeCard = useDeleteSavedCard();

  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [editCard, setEditCard] = useState<CardRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [fundCard, setFundCard] = useState<CardRow | null>(null);

  const cards = useMemo<CardRow[]>(() => {
    const issued = issuedCards ?? [];
    const stripe = (stripeCards ?? []).map<CardRow>((c) => ({
      id: `${STRIPE_PREFIX}${c.id}`,
      user_id: c.user_id,
      card_type: "debit" as any,
      card_network: ((c.card_brand ?? "visa").toLowerCase() === "mastercard" ? "mastercard" : "visa") as any,
      last_four: c.last_four ?? "••••",
      card_number: null,
      cvv: null,
      expiry_month: c.exp_month,
      expiry_year: c.exp_year,
      cardholder_name: c.cardholder_name ?? "",
      status: "active",
      spending_limit: 0,
      credit_limit: null,
      funding_source: "external",
      wallet_id: null,
      expires_at: c.exp_year && c.exp_month
        ? new Date(c.exp_year, c.exp_month - 1, 1).toISOString()
        : new Date().toISOString(),
      created_at: c.created_at,
    }));
    return [...issued, ...stripe];
  }, [issuedCards, stripeCards]);

  const toggleFlip = (id: string) =>
    setFlipped((p) => ({ ...p, [id]: !p[id] }));

  const handleToggleFreeze = (card: CardRow) => {
    updateCardStatus.mutate({
      id: card.id,
      status: card.status === "frozen" ? "active" : "frozen",
    });
  };

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
              <p className="text-muted-foreground">Tap a card to flip and view details</p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Card
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-[260px] rounded-2xl" />
              ))}
            </div>
          ) : !cards || cards.length === 0 ? (
            <div className="max-w-md mx-auto py-8">
              <motion.button
                onClick={() => setAddOpen(true)}
                animate={{ scale: [1, 1.02, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="w-full aspect-[1.586/1] rounded-2xl border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <div className="w-14 h-14 rounded-full border-2 border-current flex items-center justify-center">
                  <Plus className="w-7 h-7" />
                </div>
                <span className="text-base font-medium">Add your first card</span>
                <span className="text-xs text-muted-foreground">Virtual or physical, ready in seconds</span>
              </motion.button>
            </div>
          ) : (
            <CardStack
              cards={cards}
              flipped={flipped}
              onToggleFlip={toggleFlip}
              onAddCard={() => setAddOpen(true)}
              renderActions={(card) => {
                const isFrozen = card.status === "frozen";
                const isStripe = card.id.startsWith(STRIPE_PREFIX);
                const isExternal = card.funding_source === "external";
                return (
                  <div className="flex items-start justify-center gap-6 pt-1">
                    {isStripe ? (
                      <ActionTile
                        icon={<Send className="w-5 h-5" />}
                        label="Use to send"
                        onClick={() => navigate("/send?source=card")}
                      />
                    ) : isExternal ? (
                      <ActionTile
                        icon={<CreditCard className="w-5 h-5" />}
                        label="Fund wallet"
                        onClick={() => setFundCard(card)}
                      />
                    ) : (
                      <ActionTile
                        icon={isFrozen ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                        label={isFrozen ? "Unlock card" : "Lock card"}
                        onClick={() => handleToggleFreeze(card)}
                      />
                    )}
                    <ActionTile
                      icon={<CreditCard className="w-5 h-5" />}
                      label="Card details"
                      onClick={() => toggleFlip(card.id)}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex flex-col items-center gap-1.5 group">
                          <span className="w-12 h-12 rounded-2xl flex items-center justify-center border bg-card group-hover:bg-accent transition-colors">
                            <Settings className="w-5 h-5" />
                          </span>
                          <span className="text-xs text-muted-foreground">Settings</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center">
                        {!isStripe && (
                          <DropdownMenuItem onClick={() => setEditCard(card)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Edit card
                          </DropdownMenuItem>
                        )}
                        {!isExternal && !isStripe && (
                          <DropdownMenuItem onClick={() => handleToggleFreeze(card)}>
                            <Snowflake className="w-4 h-4 mr-2" />
                            {isFrozen ? "Unfreeze" : "Freeze"} card
                          </DropdownMenuItem>
                        )}
                        {card.card_type === "virtual" && (
                          <DropdownMenuItem
                            onClick={() => updateCard.mutate({ id: card.id, card_type: "physical" })}
                          >
                            <CreditCard className="w-4 h-4 mr-2" />
                            Request physical
                          </DropdownMenuItem>
                        )}
                        {!isStripe && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(card)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {isStripe ? "Remove card" : "Delete card"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              }}
            />
          )}


          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Instant Lock</h4>
                <p className="text-sm text-muted-foreground">
                  Lock your card instantly from the app if it's lost or stolen
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
        onDelete={(id) => {
          if (id.startsWith(STRIPE_PREFIX)) {
            deleteStripeCard.mutate(id.slice(STRIPE_PREFIX.length));
          } else {
            deleteCard.mutate(id);
          }
        }}
      />

      <CardPaymentModal
        open={!!fundCard}
        onOpenChange={(o) => { if (!o) setFundCard(null); }}
        defaultWalletId={fundCard?.wallet_id ?? undefined}
        title={fundCard ? `Fund wallet with •••• ${fundCard.last_four}` : "Fund Wallet"}
        onSuccess={() => setFundCard(null)}
      />
    </div>
  );
};

export default CardsPage;
