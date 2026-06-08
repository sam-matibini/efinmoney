import { useQuery } from "@tanstack/react-query";
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
  return useQuery({
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
};

export function isConnectReady(acct: StripeConnectedAccount | null | undefined): boolean {
  if (!acct?.stripe_account_id) return false;
  if (acct.status !== "active") return false;
  // Accept the v2 capability shape ({payouts: 'active'}) or the legacy shape ({payouts: {status:'active'}}).
  const caps = acct.capabilities || {};
  const payouts = (caps as any).payouts ?? (caps as any).transfers;
  if (!payouts) return true; // best-effort: status=active is enough to attempt
  if (typeof payouts === "string") return payouts === "active";
  return payouts?.status === "active";
}
