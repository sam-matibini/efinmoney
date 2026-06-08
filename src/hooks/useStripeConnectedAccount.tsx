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
  raw?: Record<string, any> | null;
}

export interface StripeConnectReadiness {
  hasAccount: boolean;
  ready: boolean;
  status: string;
  message: string | null;
  pendingItems: string[];
}

function statusOf(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value?.status === "string") return value.status.toLowerCase();
  return null;
}

function humanizeKey(value: string): string {
  return value.replace(/[._]+/g, " ").replace(/_/g, " ").trim();
}

export function getConnectReadiness(acct: StripeConnectedAccount | null | undefined): StripeConnectReadiness {
  if (!acct?.stripe_account_id) {
    return {
      hasAccount: false,
      ready: false,
      status: "missing",
      message: "No connected account found yet. Open /stripe-connect first.",
      pendingItems: [],
    };
  }

  const caps = (acct.capabilities || {}) as any;
  const recipCaps = caps?.recipient?.capabilities ?? caps?.configuration?.recipient?.capabilities ?? {};
  const candidateStatuses = [
    recipCaps?.payouts,
    recipCaps?.transfers,
    caps?.payouts,
    caps?.transfers,
    caps?.stripe_balance?.payouts,
    caps?.stripe_balance?.transfers,
    caps?.payouts_enabled === true ? "active" : null,
  ]
    .map(statusOf)
    .filter(Boolean) as string[];

  const requirements = (acct.requirements || acct.raw?.requirements || {}) as any;
  const pendingItems = Array.from(
    new Set(
      [
        ...(requirements?.currently_due || []),
        ...(requirements?.past_due || []),
        ...(requirements?.pending_verification || []),
      ]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map(humanizeKey),
    ),
  );

  const ready = acct.status === "active" || candidateStatuses.includes("active");
  const disabledReason = requirements?.disabled_reason ? humanizeKey(String(requirements.disabled_reason)) : null;
  const status = ready ? "active" : acct.status || candidateStatuses[0] || "pending";

  let message: string | null = null;
  if (!ready) {
    if (disabledReason) {
      message = `Stripe still blocks payouts: ${disabledReason}.`;
    } else if (pendingItems.length > 0) {
      message = `Stripe still needs: ${pendingItems.slice(0, 3).join(", ")}${pendingItems.length > 3 ? "…" : ""}.`;
    } else if (candidateStatuses.length > 0) {
      message = `Stripe still reports this account as ${candidateStatuses[0]}.`;
    } else {
      message = "Your connected account is not ready for payouts yet. Refresh status or finish onboarding.";
    }
  }

  return {
    hasAccount: true,
    ready,
    status,
    message,
    pendingItems,
  };
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
  return getConnectReadiness(acct).ready;
}
