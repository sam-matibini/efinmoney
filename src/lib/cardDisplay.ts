import type { Card } from "@/hooks/useCards";

export type CardKind = "virtual" | "physical" | "credit" | "linked";

/** Classify a card for display and actions. */
export const getCardKind = (card: Pick<Card, "card_type" | "funding_source">): CardKind => {
  if (card.funding_source === "external") return "linked";
  if (card.card_type === "credit") return "credit";
  if (card.card_type === "physical") return "physical";
  return "virtual";
};

export const getCardKindLabel = (card: Pick<Card, "card_type" | "funding_source">): string => {
  const kind = getCardKind(card);
  if (kind === "linked") return "Linked";
  if (kind === "credit") return "Credit";
  if (kind === "physical") return "Physical";
  return "Virtual";
};

/** Wallet-issued cards that support fund + card-to-card transfer. */
export const isFundableIssuedCard = (card: Pick<Card, "card_type" | "funding_source">): boolean =>
  card.funding_source === "wallet";

export const cardKindBadgeClass = (kind: CardKind): string => {
  switch (kind) {
    case "virtual":
      return "bg-violet-500/90 text-white border-violet-400/50";
    case "physical":
      return "bg-amber-500/90 text-white border-amber-400/50";
    case "credit":
      return "bg-rose-500/90 text-white border-rose-400/50";
    case "linked":
      return "bg-slate-500/90 text-white border-slate-400/50";
  }
};
