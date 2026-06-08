import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TreasuryFA = {
  id: string;
  stripe_fa_id: string;
  owner_kind: "platform" | "user";
  user_id: string | null;
  connected_account_id: string | null;
  currency: string;
  aba_routing: string | null;
  account_number_last4: string | null;
  status: string;
  balance_available: number;
  balance_pending: number;
  created_at: string;
};

export type TreasuryTransfer = {
  id: string;
  fa_id: string;
  user_id: string | null;
  kind: string;
  stripe_id: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  network: string | null;
  status: string;
  description: string | null;
  failure_reason: string | null;
  journal_id: string | null;
  created_at: string;
};

export type TreasuryReceived = {
  id: string;
  fa_id: string;
  user_id: string | null;
  stripe_id: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
};

export function useTreasury() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["treasury", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("treasury-list");
      if (error) throw error;
      return data as {
        financial_accounts: TreasuryFA[];
        transfers: TreasuryTransfer[];
        received: TreasuryReceived[];
        staff: boolean;
      };
    },
  });

  const createFa = useMutation({
    mutationFn: async (vars: { owner_kind: "platform" | "user"; user_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("treasury-create-fa", { body: vars });
      if (error) {
        // Parse JSON body from FunctionsHttpError so the real message surfaces (e.g. treasury_not_enabled)
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) {
            const body = await ctx.json();
            throw new Error(body?.error ?? error.message);
          }
        } catch (inner: any) {
          if (inner instanceof Error && inner.message) throw inner;
        }
        throw error;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treasury"] }),
  });

  const reveal = useMutation({
    mutationFn: async (fa_id: string) => {
      const { data, error } = await supabase.functions.invoke("treasury-reveal-account-numbers", {
        body: { fa_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { routing_number: string; account_number: string; bank_name?: string };
    },
  });

  const inbound = useMutation({
    mutationFn: async (vars: { fa_id: string; origin_payment_method: string; amount: number; description?: string }) => {
      const { data, error } = await supabase.functions.invoke("treasury-inbound-transfer", { body: vars });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treasury"] }),
  });

  const outbound = useMutation({
    mutationFn: async (vars: {
      fa_id: string;
      destination_payment_method: string;
      amount: number;
      network?: "ach" | "us_domestic_wire";
      description?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("treasury-outbound-transfer", { body: vars });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treasury"] }),
  });

  const outboundPayment = useMutation({
    mutationFn: async (vars: {
      fa_id: string;
      amount: number;
      payee_name: string;
      routing_number: string;
      account_number: string;
      account_holder_type?: "individual" | "company";
      network?: "ach" | "us_domestic_wire";
      description?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("treasury-outbound-payment", { body: vars });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treasury"] }),
  });

  return { list, createFa, reveal, inbound, outbound, outboundPayment };
}
