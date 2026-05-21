import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type IssuedCardStatus = "active" | "frozen" | "cancelled" | "pending";
export type IssuedCardPurpose = "personal" | "business" | "single_use" | "subscription";

export interface IssuedCard {
  id: string;
  user_id: string;
  cardholder_id: string;
  stripe_card_id: string | null;
  last4: string | null;
  brand: string;
  currency: string;
  card_type: "virtual" | "physical";
  purpose: IssuedCardPurpose;
  status: IssuedCardStatus;
  nickname: string | null;
  funding_wallet_id: string | null;
  exp_month: number | null;
  exp_year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CardControls {
  per_authorization_limit: number | null;
  daily_limit: number | null;
  weekly_limit: number | null;
  monthly_limit: number | null;
  allowed_categories: string[] | null;
  blocked_categories: string[] | null;
  allowed_countries: string[] | null;
  single_use: boolean;
  subscription_lock_merchant: string | null;
}

export interface CardAuthorization {
  id: string;
  amount: number;
  currency: string;
  merchant_name: string | null;
  merchant_category: string | null;
  status: "pending" | "approved" | "declined" | "reversed" | "expired";
  decline_reason: string | null;
  created_at: string;
}

export interface CardTxn {
  id: string;
  amount: number;
  currency: string;
  merchant_name: string | null;
  merchant_category: string | null;
  posted_at: string;
}

export const useIssuedCards = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["issued-cards", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<IssuedCard[]> => {
      const { data, error } = await supabase
        .from("issued_cards" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as IssuedCard[];
    },
  });
};

export const useIssuedCard = (id: string | undefined) => {
  return useQuery({
    queryKey: ["issued-card", id],
    enabled: !!id,
    queryFn: async (): Promise<IssuedCard | null> => {
      const { data, error } = await supabase
        .from("issued_cards" as any)
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as IssuedCard | null;
    },
  });
};

export const useCardControls = (cardId: string | undefined) => {
  return useQuery({
    queryKey: ["card-controls", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardControls | null> => {
      const { data, error } = await supabase
        .from("card_spending_controls" as any)
        .select("*")
        .eq("card_id", cardId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CardControls | null;
    },
  });
};

export const useCardAuthorizations = (cardId: string | undefined) => {
  return useQuery({
    queryKey: ["card-authorizations", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardAuthorization[]> => {
      const { data, error } = await supabase
        .from("card_authorizations" as any)
        .select("*")
        .eq("card_id", cardId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CardAuthorization[];
    },
  });
};

export const useCardTransactions = (cardId: string | undefined) => {
  return useQuery({
    queryKey: ["card-transactions", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardTxn[]> => {
      const { data, error } = await supabase
        .from("card_transactions" as any)
        .select("*")
        .eq("card_id", cardId!)
        .order("posted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CardTxn[];
    },
  });
};

export const useCardFundingEvents = (cardId: string | undefined) => {
  return useQuery({
    queryKey: ["card-funding", cardId],
    enabled: !!cardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_funding_events" as any)
        .select("*")
        .eq("card_id", cardId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
};

export const useIssuedCardMutations = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["issued-cards", user?.id] });
  };

  const createCard = useMutation({
    mutationFn: async (input: {
      nickname?: string;
      currency?: string;
      purpose?: IssuedCardPurpose;
      funding_wallet_id?: string;
      tap_to_pay?: boolean;
      controls?: Partial<CardControls>;
    }) => {
      const { data, error } = await supabase.functions.invoke("stripe-issuing-create-card", { body: input });
      if (error) {
        // supabase-js swallows the body on non-2xx; try to read it from the response
        let serverMessage = error.message;
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) serverMessage = body.error;
          } catch { /* ignore */ }
        }
        throw new Error(serverMessage);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { card: IssuedCard; sandbox?: boolean };
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(res.sandbox ? "Card created (test mode)" : "Virtual card created");
    },
    onError: (e: Error) => {
      const msg = e.message || "Failed to create card";
      if (/profile|address|full name|postal|street|city/i.test(msg)) {
        toast.error("Complete your profile to issue a card", {
          description: "We need your full name and billing address (street, city, postal code) before issuing a Visa/Mastercard.",
          action: {
            label: "Open Profile Settings",
            onClick: () => { window.location.href = "/profile"; },
          },
          duration: 10000,
        });
      } else if (/tier 3|tier_3|verification/i.test(msg)) {
        toast.error("Identity verification required", {
          description: "Card issuance requires Tier 3 (full ID + address verification).",
          action: { label: "Verify identity", onClick: () => { window.location.href = "/kyc"; } },
          duration: 10000,
        });
      } else if (/rate limit/i.test(msg)) {
        toast.error("Too many attempts", { description: "Please wait a few minutes before trying again." });
      } else {
        toast.error(msg);
      }
    },

  });

  const updateCard = useMutation({
    mutationFn: async (input: { card_id: string; action: "freeze" | "unfreeze" | "cancel" | "update_controls" | "rename"; controls?: any; nickname?: string }) => {
      const { data, error } = await supabase.functions.invoke("stripe-issuing-update-card", { body: input });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["issued-card", vars.card_id] });
      qc.invalidateQueries({ queryKey: ["card-controls", vars.card_id] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message || "Failed"),
  });

  const fundCard = useMutation({
    mutationFn: async (input: { card_id: string; wallet_id: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("stripe-issuing-fund-card", { body: input });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["card-funding", vars.card_id] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      toast.success("Card funded");
    },
    onError: (e: Error) => toast.error(e.message || "Funding failed"),
  });

  return { createCard, updateCard, fundCard };
};
