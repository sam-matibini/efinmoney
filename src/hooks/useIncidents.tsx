import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Incident {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "service_outage" | "security_breach" | "safeguarding_failure" | "fraud_event" | "processor_outage" | "compliance_breach" | "other";
  status: "open" | "investigating" | "root_cause_analysis" | "corrective_action" | "closed" | "reopened";
  description: string | null;
  impact: string | null;
  affected_systems: string[];
  is_rpaa_significant: boolean;
  reported_by: string | null;
  assigned_to: string | null;
  root_cause: string | null;
  remediation: string | null;
  corrective_action: string | null;
  closed_by: string | null;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface IncidentTimelineEntry {
  id: string;
  incident_id: string;
  event_type: string;
  description: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export const useIncidents = (filters?: { status?: string; category?: string }) =>
  useQuery({
    queryKey: ["incidents", filters],
    queryFn: async (): Promise<Incident[]> => {
      const searchParams = new URLSearchParams();
      if (filters?.status) searchParams.set("status", filters.status);
      if (filters?.category) searchParams.set("category", filters.category);
      const qs = searchParams.toString();
      const { data, error } = await supabase.functions.invoke("incident-management", {
        body: { method: "GET", path: qs ? `?${qs}` : "" } as unknown as Record<string, never>,
      });
      if (error) throw error;
      return (data as { incidents: Incident[] }).incidents || [];
    },
    refetchInterval: 30_000,
  });

export const useIncidentDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ["incident", id],
    enabled: !!id,
    queryFn: async (): Promise<{ incident: Incident; timeline: IncidentTimelineEntry[] }> => {
      const { data, error } = await supabase.functions.invoke("incident-management", {
        body: { method: "GET", path: id } as unknown as Record<string, never>,
      });
      if (error) throw error;
      const result = data as { incident: Incident; timeline: IncidentTimelineEntry[] };
      if (!result.incident) throw new Error("Incident not found");
      return result;
    },
    refetchInterval: 15_000,
  });

export const useCreateIncident = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      severity: string;
      category: string;
      description?: string;
      impact?: string;
      affected_systems?: string[];
      assigned_to?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("incident-management", {
        body: { ...payload, method: "POST" } as unknown as Record<string, never>,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
};

export const useUpdateIncident = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; severity?: string; assigned_to?: string | null; root_cause?: string; corrective_action?: string; comment?: string }) => {
      const { data, error } = await supabase.functions.invoke("incident-management", {
        body: { method: "PATCH", path: id, ...updates } as unknown as Record<string, never>,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident"] });
    },
  });
};

export const useAddIncidentComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const { data, error } = await supabase.functions.invoke("incident-management", {
        body: { method: "POST", path: `${id}/comment`, comment } as unknown as Record<string, never>,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident"] }),
  });
};