import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Plus,
  Lock,
  Settings,
  Trash2,
  Send,
  Sparkles,
  Wallet as WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import DeleteCardModal from "@/components/modals/DeleteCardModal";
import AddCardModal from "@/components/modals/AddCardModal";
import CardPaymentModal from "@/components/modals/CardPaymentModal";
import PremiumVirtualCard, {
  type PremiumVirtualCardData,
} from "@/components/cards/PremiumVirtualCard";
import { useSavedCards, useDeleteSavedCard } from "@/hooks/useSavedCards";
import { useProfile } from "@/hooks/useProfile";
import { useWallets } from "@/hooks/useWallets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ---------- Mock virtual card factory ---------- */
const buildMockVirtualCards = (
  cardholderName: string,
  currencies: string[]
): PremiumVirtualCardData[] => {
  const palette: PremiumVirtualCardData["variant"][] = [
    "obsidian",
    "emerald",
    "platinum",
  ];
  const fixed: Record<string, { pan: string; cvv: string }> = {
    USD: { pan: "4242424255785678", cvv: "284" },
    EUR: { pan: "5555444433339912", cvv: "713" },
    GBP: { pan: "4111000022227734", cvv: "509" },
    CAD: { pan: "4024007112341580", cvv: "146" },
  };
  return currencies.map((cur, i) => {
    const seed = fixed[cur] ?? {
      pan: `4${Math.floor(1e15 + Math.random() * 9e15)}`.slice(0, 16),
      cvv: String(Math.floor(100 + Math.random() * 900)),
    };
    return {
      id: `mock-${cur}`,
      cardholderName: cardholderName.toUpperCase() || "EFINMONEY MEMBER",
      fullNumber: seed.pan,
      cvv: seed.cvv,
      expMonth: 12,
      expYear: new Date().getFullYear() + 4,
      currency: cur,
      network: "visa",
      variant: palette[i % palette.length],
    };
  });
};

const CardsPage = () => {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: wallets } = useWallets();
  const { data: stripeCards, isLoading: loadingStripe } = useSavedCards();
  const deleteStripeCard = useDeleteSavedCard();

  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [fundOpen, setFundOpen] = useState(false);

  const virtualCards = useMemo<PremiumVirtualCardData[]>(() => {
    const name = profile?.full_name ?? "eFinMoney Member";
    const currencies =
      wallets && wallets.length > 0
        ? Array.from(new Set(wallets.map((w) => w.currency_code))).slice(0, 3)
        : ["USD"];
    return buildMockVirtualCards(name, currencies);
  }, [profile, wallets]);

  const deleteTargetCard = stripeCards?.find((c) => c.id === deleteId) ?? null;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />

      <main className="container relative z-0 px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-10"
        >
          {/* ============== SECTION 1: VIRTUAL CARDS ============== */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-2xl font-display font-bold">
                    My Virtual Cards
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Issued by eFinMoney · Tap a card to flip · Reveal details to copy
                </p>
              </div>
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                <Sparkles className="w-3 h-3 mr-1" /> Preview
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {virtualCards.map((c) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <PremiumVirtualCard card={c} />
                </motion.div>
              ))}
            </div>
          </section>

          {/* ============== SECTION 2: LINKED FUNDING CARDS ============== */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <WalletIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-xl font-display font-bold">
                    Linked Funding Cards
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  External Visa / Mastercard for{" "}
                  <span className="text-foreground/80 font-medium">
                    wallet funding only
                  </span>{" "}
                  — not for spending.
                </p>
              </div>
              <Button onClick={() => setAddOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> Add card
              </Button>
            </div>

            {loadingStripe ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : !stripeCards || stripeCards.length === 0 ? (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full rounded-xl border-2 border-dashed border-muted-foreground/30 p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Link a funding card</span>
                <span className="text-xs text-muted-foreground">
                  Securely saved with Stripe
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stripeCards.map((c) => (
                  <Card
                    key={c.id}
                    className="relative overflow-hidden border-border/60 hover:border-border transition-colors"
                  >
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white">
                            <CreditCard className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold capitalize">
                                {c.card_brand ?? "Card"}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                •••• {c.last_four}
                              </span>
                              {c.is_default && (
                                <Badge variant="secondary" className="text-[10px] h-5">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Exp{" "}
                              {String(c.exp_month ?? "--").padStart(2, "0")}/
                              {String(c.exp_year ?? "--").slice(-2)}
                              {c.cardholder_name ? ` · ${c.cardholder_name}` : ""}
                            </p>
                          </div>
                        </div>

                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-lg hover:bg-accent">
                              <Settings className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setFundOpen(true);
                              }}
                            >
                              <WalletIcon className="w-4 h-4 mr-2" />
                              Fund wallet
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate("/send?source=card")}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Use to send
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteId(c.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove card
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Lock className="w-3 h-3" />
                        For Wallet Funding Only · Secured by Stripe
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ============== INFO TILES ============== */}
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

      <DeleteCardModal
        isOpen={!!deleteTargetCard}
        onClose={() => setDeleteId(null)}
        card={
          deleteTargetCard
            ? {
                id: deleteTargetCard.id,
                type: "debit",
                last_four: deleteTargetCard.last_four ?? "••••",
                brand: (deleteTargetCard.card_brand ?? "visa") as any,
                status: "active",
                currency: deleteTargetCard.currency_code ?? "USD",
                balance: 0,
                expires: `${String(deleteTargetCard.exp_month ?? 1).padStart(2, "0")}/${String(deleteTargetCard.exp_year ?? new Date().getFullYear()).slice(-2)}`,
              }
            : null
        }
        onDelete={(id) => {
          deleteStripeCard.mutate(id);
          setDeleteId(null);
        }}
      />

      <CardPaymentModal
        open={fundOpen}
        onOpenChange={setFundOpen}
        title="Fund Wallet"
        onSuccess={() => setFundOpen(false)}
      />
    </div>
  );
};

export default CardsPage;
