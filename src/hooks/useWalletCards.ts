import { useMemo } from "react";
import { useCards } from "./useCards";
import { useIssuedCards } from "./useIssuedCards";

export interface WalletLinkedCard {
  id: string;
  lastFour: string;
  brand: string;
  status: string;
  cardType: string;
  isStripe: boolean;
  fundingWalletId: string | null;
}

export function useWalletCards() {
  const { data: legacyCards, isLoading: legacyLoading } = useCards();
  const { data: issuedCards, isLoading: issuedLoading } = useIssuedCards();

  const walletCardMap = useMemo<Record<string, WalletLinkedCard[]>>(() => {
    const map: Record<string, WalletLinkedCard[]> = {};

    for (const c of legacyCards ?? []) {
      if (!c.wallet_id) continue;
      if (!map[c.wallet_id]) map[c.wallet_id] = [];
      map[c.wallet_id].push({
        id: c.id,
        lastFour: c.last_four,
        brand: c.card_network,
        status: c.status,
        cardType: c.card_type,
        isStripe: false,
        fundingWalletId: c.wallet_id,
      });
    }

    for (const c of issuedCards ?? []) {
      const wid = c.funding_wallet_id;
      if (!wid) continue;
      if (!map[wid]) map[wid] = [];
      map[wid].push({
        id: c.id,
        lastFour: c.last4 ?? "••••",
        brand: c.brand,
        status: c.status,
        cardType: c.card_type,
        isStripe: true,
        fundingWalletId: wid,
      });
    }

    return map;
  }, [legacyCards, issuedCards]);

  const linkedCardCount = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const [wid, cards] of Object.entries(walletCardMap)) {
      counts[wid] = cards.length;
    }
    return counts;
  }, [walletCardMap]);

  const totalLinkedCards = useMemo(() => {
    let total = 0;
    for (const cards of Object.values(walletCardMap)) {
      total += cards.length;
    }
    return total;
  }, [walletCardMap]);

  return {
    walletCardMap,
    linkedCardCount,
    totalLinkedCards,
    isLoading: legacyLoading || issuedLoading,
  };
}
