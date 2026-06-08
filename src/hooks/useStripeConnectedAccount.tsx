import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface StripeConnectedAccount {
  id: string;
  user_id: string;
  stripe_account_id: string;
  country: string;
  status: string;
  capabilities: Record<string, any> | null;
  requirements: Record<string, any> | null;
}

export const useStripeConnectedAccount = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["stripe_connected_account", user?.id],
    queryFn: async (): Promise<StripeConnectedAccount | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("stripe_connected_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("Failed to load connected account", error);
        return null;
      }
      return (data as any) ?? null;
    },
    enabled: !!user,
  });

  const refresh = useCallback(async () => {
    if (!user) return null;
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-refresh-status", { body: {} });
      if (error) {
        console.error("refresh-status invoke failed", error);
        return null;
      }
      await qc.invalidateQueries({ queryKey: ["stripe_connected_account", user.id] });
      return data?.account ?? null;
    } catch (e) {
      console.error("refresh-status threw", e);
      return null;
    }
  }, [user, qc]);

  return { ...query, refresh };
};

export function isConnectReady(acct: StripeConnectedAccount | null | undefined): boolean {
  if (!acct?.stripe_account_id) return false;
  if (acct.status !== "active") return false;
  const caps = (acct.capabilities || {}) as any;
  // v2 shape: { recipient: { capabilities: { payouts: 'active' | { status } } } }
  const recipCaps = caps?.recipient?.capabilities ?? {};
  const merchCaps = caps?.merchant?.capabilities ?? {};
  const candidates = [
    recipCaps?.payouts,
    recipCaps?.transfers,
    merchCaps?.card_payments,
    caps?.payouts,
    caps?.transfers,
    caps?.card_payments,
  ];
  const statusOf = (c: any) => (typeof c === "string" ? c : c?.status);
  if (candidates.some((c) => statusOf(c) === "active")) return true;
  // best-effort: if status='active' but caps shape unknown, allow attempt
  return candidates.every((c) => c === undefined);
}
