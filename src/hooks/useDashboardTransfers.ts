import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const DASHBOARD_TRANSFER_LIMIT = 200;

export const DASHBOARD_TRANSFER_SELECT =
  "id, created_at, source_amount, source_currency, recipient_country, status";

export interface DashboardTransfer {
  id: string;
  created_at: string;
  source_amount: number;
  source_currency: string;
  recipient_country: string;
  status: string;
}

export const dashboardTransfersQueryKey = (userId: string) =>
  ["dashboard-transfers", userId] as const;

export async function fetchDashboardTransfers(userId: string): Promise<DashboardTransfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select(DASHBOARD_TRANSFER_SELECT)
    .eq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_TRANSFER_LIMIT);

  if (error) throw error;
  return (data ?? []) as DashboardTransfer[];
}

/** Shared narrow transfer query for all dashboard widgets. */
export const useDashboardTransfers = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: dashboardTransfersQueryKey(user?.id ?? ""),
    queryFn: () => fetchDashboardTransfers(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
};
