import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Lock, Unlock, Settings, Trash2, Snowflake, Send, Wallet, ArrowRightLeft, Eye } from "lucide-react";
import { useMemo, useState, useEffect, forwardRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import EditCardModal from "@/components/modals/EditCardModal";
import DeleteCardModal from "@/components/modals/DeleteCardModal";
import AddCardModal from "@/components/modals/AddCardModal";
import FundCardModal from "@/components/modals/FundCardModal";
import TransferCardModal from "@/components/modals/TransferCardModal";
import ViewCardDetailsModal from "@/components/modals/ViewCardDetailsModal";
import CardPaymentModal from "@/components/modals/CardPaymentModal";
import CardStack from "@/components/cards/CardStack";
import CardFeatureSpotlights from "@/components/cards/CardFeatureSpotlights";
import { useCards, useCardMutations, type Card as CardRow, type RevealedCardSecrets } from "@/hooks/useCards";
import { usePinGate } from "@/components/send/usePinGate";
import { useSavedCards, useDeleteSavedCard } from "@/hooks/useSavedCards";
import { getCardKindLabel, isFundableIssuedCard } from "@/lib/cardDisplay";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
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

interface ActionTileProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "destructive" | "primary";
}

const ActionTile = forwardRef<HTMLButtonElement, ActionTileProps>(
  ({ icon, label, variant = "default", disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2 min-w-[4.5rem] group",
        disabled && "opacity-45 cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-200",
          "bg-card/90 shadow-sm",
          "group-hover:scale-105 group-hover:shadow-md group-hover:border-primary/35 group-hover:bg-accent/80",
          "group-active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          variant === "destructive" && "text-destructive group-hover:border-destructive/35 group-hover:bg-destructive/5",
          variant === "primary" && "border-primary/25 bg-primary/5 text-primary group-hover:bg-primary/10 group-hover:border-primary/50",
          variant === "default" && "text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight max-w-[5rem]">
        {label}
      </span>
    </button>
  ),
);
ActionTile.displayName = "ActionTile";

const CardsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: issuedCards, isLoading } = useCards();
  const { data: stripeCards } = useSavedCards();
  const { updateCardStatus, updateCard, deleteCard, revealCardSecrets } = useCardMutations();
  const deleteStripeCard = useDeleteSavedCard();
  const { requirePin, pinGate } = usePinGate();

  const [revealedSecrets, setRevealedSecrets] = useState<RevealedCardSecrets | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [editCard, setEditCard] = useState<CardRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"issue" | "link">("issue");
  const [fundCardTarget, setFundCardTarget] = useState<CardRow | null>(null);
  const [transferSource, setTransferSource] = useState<CardRow | null>(null);
  const [fundCard, setFundCard] = useState<CardRow | null>(null);
  const [activeCard, setActiveCard] = useState<CardRow | null>(null);

  useEffect(() => {
    if (searchParams.get("link") === "1") {
      setAddMode("link");
      setAddOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const topup = searchParams.get("topup");
    if (!topup) return;
    if (topup === "success" || topup === "1") {
      toast.success("Wallet topped up — use Fund card to move money to your card");
    } else if (topup === "cancelled") {
      toast.message("Top-up cancelled");
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const fundableCards = useMemo(
    () => (issuedCards ?? []).filter(isFundableIssuedCard),
    [issuedCards],
  );

  const cards = useMemo<CardRow[]>(() => {
    const issued = issuedCards ?? [];
    const stripe = (stripeCards ?? []).map<CardRow>((c) => ({
      id: `${STRIPE_PREFIX}${c.id}`,
      user_id: c.user_id,
      card_type: "debit" as any,
      card_network: ((c.card_brand ?? "visa").toLowerCase() === "mastercard" ? "mastercard" : "visa") as any,
      last_four: c.last_four ?? "••••",

      expiry_month: c.exp_month,
      expiry_year: c.exp_year,
      cardholder_name: c.cardholder_name ?? "",
      status: "active",
      spending_limit: 0,
      credit_limit: null,
      funding_source: "external",
      wallet_id: null,
      balance: 0,
      currency_code: null,
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

  const handleViewFullDetails = (card: CardRow) => {
    requirePin(
      async (pin) => {
        const secrets = await revealCardSecrets.mutateAsync({ card_id: card.id, pin });
        setRevealedSecrets(secrets);
        setDetailsOpen(true);
      },
      undefined,
      `Enter your transaction PIN to view full details for card ending ${card.last_four}.`,
    );
  };

  const isStripeCard = (card: CardRow | null) => !!card?.id.startsWith(STRIPE_PREFIX);
  const isIssuedManageable = (card: CardRow | null) =>
    !!card && !isStripeCard(card) && card.funding_source !== "external";

  const handleFeatureLock = () => {
    if (!isIssuedManageable(activeCard)) {
      toast.info("Select an issued eFin card above to lock or unlock it.");
      return;
    }
    handleToggleFreeze(activeCard!);
  };

  const handleFeatureVirtual = () => {
    setAddMode("issue");
    setAddOpen(true);
  };

  const handleFeatureLimits = () => {
    if (!isIssuedManageable(activeCard)) {
      toast.info("Select an issued eFin card above to set spending limits.");
      return;
    }
    setEditCard(activeCard);
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 20% 0%, hsl(var(--primary) / 0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 90% 30%, rgba(99,102,241,0.10), transparent 65%), hsl(var(--background))",
      }}>
      <AppPage width="wide" className="relative z-0">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
          }}
          className="space-y-6"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 180, damping: 22 } } }}
            className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
          >
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">My Cards</h1>
              <p className="text-muted-foreground mt-1">
                {isLoading
                  ? "Loading your cards…"
                  : cards.length === 0
                    ? "Issue a virtual card or link an existing debit card"
                    : `${cards.length} card${cards.length === 1 ? "" : "s"} · tap to flip, swipe to browse`}
              </p>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="shrink-0">
              <Button onClick={() => { setAddMode("issue"); setAddOpen(true); }} className="w-full sm:w-auto shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)]">
                <Plus className="w-4 h-4 mr-2" />
                New Card
              </Button>
            </motion.div>
          </motion.div>

          <PageHeroBanner
            icon={CreditCard}
            label="Card portfolio"
            value={isLoading ? "Loading…" : `${cards.length} card${cards.length === 1 ? "" : "s"}`}
            meta={[
              { icon: Wallet, text: "Virtual & linked debit cards" },
              { icon: Plus, text: "Issue new or link existing cards" },
            ]}
            variant="rose"
          />

          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 180, damping: 22 } } }}
            className="rounded-3xl border border-border/80 bg-card/40 backdrop-blur-xl p-4 sm:p-6 shadow-sm"
          >
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
              onActiveCardChange={setActiveCard}
              renderActions={(card) => {
                const isFrozen = card.status === "frozen";
                const isStripe = card.id.startsWith(STRIPE_PREFIX);
                const isExternal = card.funding_source === "external";
                const isFundable = isFundableIssuedCard(card);
                const canTransfer = isFundable && fundableCards.length > 1;
                return (
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
                      <div className="flex items-start justify-center gap-3 sm:gap-5 min-w-max mx-auto">
                    {isStripe ? (
                      <>
                        <ActionTile
                          icon={<Send className="w-5 h-5" />}
                          label="Use to send"
                          variant="primary"
                          onClick={() => navigate("/send?source=card")}
                        />
                        <ActionTile
                          icon={<CreditCard className="w-5 h-5" />}
                          label="Top up wallet"
                          onClick={() => navigate("/wallet/topup")}
                        />
                      </>
                    ) : isFundable ? (
                      <>
                        <ActionTile
                          icon={<Wallet className="w-5 h-5" />}
                          label="Fund card"
                          variant="primary"
                          onClick={() => setFundCardTarget(card)}
                        />
                        <ActionTile
                          icon={<ArrowRightLeft className="w-5 h-5" />}
                          label="Transfer"
                          onClick={() => setTransferSource(card)}
                          disabled={!canTransfer}
                        />
                        <ActionTile
                          icon={isFrozen ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                          label={isFrozen ? "Unlock" : "Lock"}
                          onClick={() => handleToggleFreeze(card)}
                        />
                      </>
                    ) : isExternal ? (
                      <ActionTile
                        icon={<CreditCard className="w-5 h-5" />}
                        label="Fund wallet"
                        variant="primary"
                        onClick={() => setFundCard(card)}
                      />
                    ) : null}
                    {!isStripe && !isExternal && (
                      <ActionTile
                        icon={<Eye className="w-5 h-5" />}
                        label="View full details"
                        onClick={() => handleViewFullDetails(card)}
                      />
                    )}
                    <ActionTile
                      icon={<CreditCard className="w-5 h-5" />}
                      label="Card details"
                      onClick={() => toggleFlip(card.id)}
                    />
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <ActionTile
                          icon={<Settings className="w-5 h-5" />}
                          label="Settings"
                        />
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
                    </div>
                    {isFundable && !canTransfer && (
                      <p className="text-[11px] text-muted-foreground text-center px-4">
                        Create another {getCardKindLabel(card).toLowerCase()} card in the same currency to transfer between cards.
                      </p>
                    )}
                  </div>
                );
              }}
            />
          )}
          </motion.div>



          <CardFeatureSpotlights
            hasIssuedCard={isIssuedManageable(activeCard)}
            activeCardFrozen={activeCard?.status === "frozen"}
            onLock={handleFeatureLock}
            onCreateVirtual={handleFeatureVirtual}
            onSpendingLimits={handleFeatureLimits}
          />
        </motion.div>
      </AppPage>

      <AddCardModal isOpen={addOpen} onClose={() => setAddOpen(false)} defaultMode={addMode} />

      <FundCardModal
        open={!!fundCardTarget}
        onClose={() => setFundCardTarget(null)}
        card={fundCardTarget}
      />

      <TransferCardModal
        open={!!transferSource}
        onClose={() => setTransferSource(null)}
        sourceCard={transferSource}
      />

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
                currency: editCard.currency_code || "USD",
                balance: Number(editCard.balance || 0),
                expires: formatExpires(editCard.expires_at),
                nickname: editCard.cardholder_name,
                dailyLimit: editCard.spending_limit,
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

      {pinGate}

      <ViewCardDetailsModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setRevealedSecrets(null);
        }}
        secrets={revealedSecrets}
      />
    </div>
  );
};

export default CardsPage;
