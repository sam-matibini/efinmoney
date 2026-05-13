import { motion } from "framer-motion";
import { CreditCard, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSavedCards, useDeleteSavedCard, useSetDefaultSavedCard } from "@/hooks/useSavedCards";
import { Skeleton } from "@/components/ui/skeleton";

const brandClass = (brand: string | null) => {
  switch ((brand ?? "").toLowerCase()) {
    case "visa": return "from-[#1a1f71] to-[#3949ab]";
    case "mastercard": return "from-[#eb001b] to-[#f79e1b]";
    case "amex":
    case "american_express": return "from-[#2671b8] to-[#1f4e8c]";
    case "discover": return "from-[#ff6000] to-[#fda636]";
    default: return "from-slate-700 to-slate-900";
  }
};

const brandLabel = (brand: string | null) => {
  if (!brand) return "Card";
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
};

const SavedCardsSection = () => {
  const { data: cards, isLoading } = useSavedCards();
  const del = useDeleteSavedCard();
  const setDefault = useSetDefaultSavedCard();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (!cards || cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold">Saved cards</h2>
        <span className="text-xs text-muted-foreground">Tokenized via Stripe</span>
      </div>
      <div className="space-y-2">
        {cards.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
          >
            <div className={`w-12 h-8 rounded-md bg-gradient-to-br ${brandClass(c.card_brand)} flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-wider`}>
              {brandLabel(c.card_brand).slice(0, 4)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">
                  {brandLabel(c.card_brand)} •••• {c.last_four}
                </p>
                {c.is_default && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                    <Star className="w-3 h-3" /> Default
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {c.cardholder_name ? `${c.cardholder_name} • ` : ""}
                Exp {String(c.exp_month ?? "").padStart(2, "0")}/{String(c.exp_year ?? "").slice(-2)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!c.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault.mutate(c.id)}
                  disabled={setDefault.isPending}
                >
                  Make default
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => del.mutate(c.id)}
                disabled={del.isPending}
                aria-label="Remove card"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default SavedCardsSection;
