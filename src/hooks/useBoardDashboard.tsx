import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BoardMetrics {
  high_risk_clients: number;
  open_alerts: number;
  pending_strs: number;
  outstanding_investigations: number;
  compliance_breaches: number;
  safeguarding_breaches: number;
  reconciliation_exceptions: number;
  system_outages: number;
  total_incidents: number;
  rpaa_significant_incidents: number;
  snapshot_at: string;
}

export const useBoardDashboard = () =>
  useQuery({
    queryKey: ["board-dashboard"],
    queryFn: async (): Promise<BoardMetrics> => {
      // board_dashboard_view is created in migration — supabase types may not include it yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db.from("board_dashboard_view").select("*").single();
      if (error) throw error;
      return data as BoardMetrics;
    },
    refetchInterval: 60_000,
  });