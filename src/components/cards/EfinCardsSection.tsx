import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import VirtualCardVisual from "@/components/cards/VirtualCardVisual";
import IssueVirtualCardModal from "@/components/cards/IssueVirtualCardModal";
import { useIssuedCards } from "@/hooks/useIssuedCards";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";

const EfinCardsSection = () => {
  const navigate = useNavigate();
  const { data: cards, isLoading } = useIssuedCards();
  const { tier } = useKyc();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);

  const tierOk = tier?.current_tier === "tier_3";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            eFinVISA · Virtual Visa Cards
          </h2>
          <p className="text-xs text-muted-foreground">Instant Visa cards. Spend online or tap to pay with Apple Pay & Google Pay.</p>
        </div>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={() => {
            if (!tierOk) {
              navigate("/kyc");
              return;
            }
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> New card
        </Button>
      </div>

      {!tierOk && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-200">
            Virtual card issuance requires Tier 3 verification (ID + address).{" "}
            <button onClick={() => navigate("/kyc")} className="underline">Complete KYC</button>
          </p>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-44 w-full max-w-md" />
      ) : !cards || cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No virtual cards yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((c) => (
            <motion.button
              key={c.id}
              whileHover={{ y: -2 }}
              onClick={() => navigate(`/cards/efin/${c.id}`)}
              className="text-left"
            >
              <VirtualCardVisual
                brand={c.brand}
                last4={c.last4}
                nickname={c.nickname}
                currency={c.currency}
                status={c.status}
                expMonth={c.exp_month}
                expYear={c.exp_year}
                tapToPay={(c.metadata as any)?.tap_to_pay !== false}
                cardholderName={profile?.full_name}
              />
            </motion.button>
          ))}
        </div>
      )}

      <IssueVirtualCardModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => navigate(`/cards/efin/${id}`)}
      />
    </section>
  );
};

export default EfinCardsSection;
