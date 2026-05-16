import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface StellarBalance {
  asset: string;
  balance: string;
}

const HORIZON = "https://horizon-testnet.stellar.org";

async function fetchHorizonAccount(publicKey: string) {
  const r = await fetch(`${HORIZON}/accounts/${publicKey}`);
  if (r.status === 404) return null; // not yet funded
  if (!r.ok) throw new Error(`Horizon error ${r.status}`);
  return r.json();
}

export const useStellarWallet = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);

  // Read public key from profile
  const profileQ = useQuery({
    queryKey: ["stellar-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("stellar_public_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.stellar_public_key as string | null) ?? null;
    },
    enabled: !!user,
  });

  const publicKey = profileQ.data ?? null;

  // Auto-generate if missing
  useEffect(() => {
    if (!user || profileQ.isLoading || publicKey || generating) return;
    setGenerating(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "generate-stellar-wallet",
        );
        if (error) throw error;
        if (data?.stellar_address) {
          qc.setQueryData(["stellar-profile", user.id], data.stellar_address);
          qc.invalidateQueries({ queryKey: ["wallets"] });
        }
      } catch (e) {
        console.error("Stellar wallet auto-generate failed:", e);
      } finally {
        setGenerating(false);
      }
    })();
  }, [user, profileQ.isLoading, publicKey, generating, qc]);

  // Live balance from Horizon
  const balanceQ = useQuery({
    queryKey: ["stellar-balance", publicKey],
    queryFn: async (): Promise<{ xlm: string; balances: StellarBalance[]; funded: boolean }> => {
      if (!publicKey) return { xlm: "0", balances: [], funded: false };
      const acct = await fetchHorizonAccount(publicKey);
      if (!acct) return { xlm: "0", balances: [], funded: false };
      const balances: StellarBalance[] = (acct.balances ?? []).map((b: any) => ({
        asset: b.asset_type === "native" ? "XLM" : `${b.asset_code}`,
        balance: b.balance,
      }));
      const native = balances.find((b) => b.asset === "XLM");
      return { xlm: native?.balance ?? "0", balances, funded: true };
    },
    enabled: !!publicKey,
    refetchInterval: 15000,
  });

  return {
    publicKey,
    isLoading: profileQ.isLoading || generating,
    generating,
    balance: balanceQ.data?.xlm ?? "0",
    funded: balanceQ.data?.funded ?? false,
    balances: balanceQ.data?.balances ?? [],
    balanceLoading: balanceQ.isLoading,
    refetchBalance: balanceQ.refetch,
    explorerUrl: publicKey
      ? `https://stellar.expert/explorer/testnet/account/${publicKey}`
      : null,
  };
};
