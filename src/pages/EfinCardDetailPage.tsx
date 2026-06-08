import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Snowflake, Unlock, Trash2, Plus, Eye, EyeOff, Wifi, Smartphone } from "lucide-react";
import VirtualCardVisual from "@/components/cards/VirtualCardVisual";
import StripeIssuingReveal from "@/components/cards/StripeIssuingReveal";
import {
  useIssuedCard,
  useCardControls,
  useCardAuthorizations,
  useCardTransactions,
  useCardFundingEvents,
  useIssuedCardMutations,
} from "@/hooks/useIssuedCards";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EfinCardDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: card, isLoading } = useIssuedCard(id);
  const { data: controls } = useCardControls(id);
  const { data: auths } = useCardAuthorizations(id);
  const { data: txns } = useCardTransactions(id);
  const { data: funding } = useCardFundingEvents(id);
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();
  const { updateCard, fundCard } = useIssuedCardMutations();

  const [fundAmount, setFundAmount] = useState("");
  const [showReveal, setShowReveal] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-6"><Skeleton className="h-64 w-full" /></main>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-6">
          <Button variant="ghost" onClick={() => navigate("/cards")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
          <p className="mt-6 text-muted-foreground">Card not found.</p>
        </main>
      </div>
    );
  }

  const wallet = wallets?.find((w: any) => w.wallet_id === card.funding_wallet_id);
  const isSandbox = (card.metadata as any)?.sandbox;
  const tapToPay = (card.metadata as any)?.tap_to_pay !== false;

  const handleAddToWallet = (which: "apple" | "google") => {
    toast.info(
      which === "apple"
        ? "Open eFinMoney on your iPhone to add this card to Apple Pay."
        : "Open eFinMoney on your Android device to add this card to Google Pay."
    );
  };

  const handleReveal = () => setShowReveal((s) => !s);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <Header />
      <main className="container px-4 py-6 space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cards")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> All cards
        </Button>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-shrink-0">
            <VirtualCardVisual
              brand={card.brand}
              last4={card.last4}
              nickname={card.nickname}
              currency={card.currency}
              status={card.status}
              expMonth={card.exp_month}
              expYear={card.exp_year}
              tapToPay={tapToPay}
              cardholderName={profile?.full_name}
            />
            {isSandbox && (
              <p className="text-[11px] text-amber-500 mt-2 text-center">Test card — Stripe Issuing pending enablement</p>
            )}
          </div>

          <div className="flex-1 space-y-2 w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display font-bold">{card.nickname || "eFinVISA"}</h1>
              {tapToPay && card.status === "active" && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  <Wifi className="w-3 h-3 rotate-90" /> Tap to pay
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{card.currency} · {card.purpose} · {card.status}</p>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={handleReveal} disabled={(card.metadata as any)?.sandbox}>
                {showReveal ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showReveal ? "Hide details" : "Reveal details"}
              </Button>
              {card.status === "active" ? (
                <Button size="sm" variant="outline" onClick={() => updateCard.mutate({ card_id: card.id, action: "freeze" })}>
                  <Snowflake className="w-4 h-4 mr-2" /> Freeze
                </Button>
              ) : card.status === "frozen" ? (
                <Button size="sm" variant="outline" onClick={() => updateCard.mutate({ card_id: card.id, action: "unfreeze" })}>
                  <Unlock className="w-4 h-4 mr-2" /> Unfreeze
                </Button>
              ) : null}
              {card.status !== "cancelled" && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => {
                  if (confirm("Cancel this card permanently?")) updateCard.mutate({ card_id: card.id, action: "cancel" });
                }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Cancel
                </Button>
              )}
            </div>

            {tapToPay && card.status === "active" && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => handleAddToWallet("apple")}>
                  <Smartphone className="w-4 h-4 mr-2" /> Add to Apple Pay
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleAddToWallet("google")}>
                  <Smartphone className="w-4 h-4 mr-2" /> Add to Google Pay
                </Button>
              </div>
            )}

            {showReveal && !((card.metadata as any)?.sandbox) && (
              <div className="mt-3">
                <StripeIssuingReveal cardId={card.id} last4={card.last4} />
              </div>
            )}
            {(card.metadata as any)?.sandbox && (
              <p className="text-[11px] text-amber-500 mt-2">Legacy sandbox card — reveal disabled.</p>
            )}
          </div>
        </div>

        {/* Fund card */}
        {card.status === "active" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Fund this card</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {wallet ? (
                <p className="text-sm text-muted-foreground">From {wallet.currency_code} wallet · Balance {wallet.symbol}{Number(wallet.balance).toFixed(2)}</p>
              ) : (
                <p className="text-sm text-amber-500">No funding wallet linked to this card.</p>
              )}
              <div className="flex gap-2">
                <Input type="number" placeholder={`Amount in ${card.currency}`} value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
                <Button
                  onClick={() => {
                    const amt = Number(fundAmount);
                    if (!amt || !card.funding_wallet_id) return;
                    fundCard.mutate({ card_id: card.id, wallet_id: card.funding_wallet_id, amount: amt }, {
                      onSuccess: () => setFundAmount(""),
                    });
                  }}
                  disabled={!card.funding_wallet_id || !Number(fundAmount) || fundCard.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Fund
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <Card>
          <CardHeader><CardTitle className="text-base">Spending controls</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">Per transaction</Label><div>{controls?.per_authorization_limit ? `${card.currency} ${controls.per_authorization_limit}` : "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Daily</Label><div>{controls?.daily_limit ? `${card.currency} ${controls.daily_limit}` : "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Monthly</Label><div>{controls?.monthly_limit ? `${card.currency} ${controls.monthly_limit}` : "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Single-use</Label><div>{controls?.single_use ? "Yes" : "No"}</div></div>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader><CardTitle className="text-base">Transactions</CardTitle></CardHeader>
          <CardContent>
            {(!txns || txns.length === 0) && (!auths || auths.length === 0) ? (
              <p className="text-sm text-muted-foreground">No transactions yet. Once you use this card, authorizations and posted transactions appear here.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {auths?.slice(0, 10).map((a) => (
                  <div key={a.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium">{a.merchant_name || "Authorization"}</div>
                      <div className="text-xs text-muted-foreground">{a.status} · {new Date(a.created_at).toLocaleString()}</div>
                    </div>
                    <div className={a.status === "approved" ? "" : "text-muted-foreground"}>
                      {a.currency} {a.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funding events */}
        {funding && funding.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Funding history</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {funding.map((f) => (
                  <div key={f.id} className="flex justify-between py-2 border-b last:border-0">
                    <div>
                      <div>Wallet top-up</div>
                      <div className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-primary">+{f.currency} {Number(f.amount).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <MobileNav />
    </div>
  );
};

export default EfinCardDetailPage;
